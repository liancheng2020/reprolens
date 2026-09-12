import fs from "node:fs/promises";
import path from "node:path";
import axeCore from "axe-core";
import { chromium, type Page } from "playwright";
import { buildFindings, calculateScore } from "./analyzer.js";
import { businessReport, executePlan, reportVerdict } from "./business.js";
import { generateBusinessTest } from "./business-test.js";
import type { BusinessReport, StepEvidence } from "./types.js";
import { config } from "./config.js";
import { DeepSeekProvider } from "./provider.js";
import type {
  AuditSnapshot,
  AxeViolation,
  CreateRunInput,
  DeviceName,
  Finding,
  ScreenshotArtifact,
  WebVitals
} from "./types.js";

export const devices: Record<DeviceName, { label: string; width: number; height: number }> = {
  desktop: { label: "Desktop Chrome", width: 1440, height: 900 },
  iphone13: { label: "iPhone 13", width: 390, height: 844 },
  pixel7: { label: "Pixel 7", width: 412, height: 915 }
};

interface ScannerCallbacks {
  evidence?(evidence: StepEvidence): Promise<void>;
  step(title: string, detail?: string): Promise<void>;
  screenshot(artifact: ScreenshotArtifact): Promise<void>;
  finding(finding: Finding): Promise<void>;
}

export interface ScanResult {
  findings: Finding[];
  screenshots: ScreenshotArtifact[];
  score: number;
  verdict: "reproduced" | "not_reproduced" | "inconclusive";
  confidence?: number;
  business: BusinessReport;
  summary: string;
  generatedTest: string;
  provider: "deepseek" | "deterministic";
  durationMs: number;
  consoleErrors: number;
  networkErrors: number;
  accessibilityIssues: number;
  performanceIssues: number;
  qualityMetrics: Array<{ device: DeviceName; vitals: WebVitals }>;
}

async function installPerformanceObservers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const target = window as unknown as { __reprolensVitals: { lcpMs?: number; cls: number; inpMs?: number } };
    target.__reprolensVitals = { cls: 0 };

    if (PerformanceObserver.supportedEntryTypes?.includes("largest-contentful-paint")) {
      new PerformanceObserver((list) => {
        const last = list.getEntries().at(-1);
        if (last) target.__reprolensVitals.lcpMs = last.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    }
    if (PerformanceObserver.supportedEntryTypes?.includes("layout-shift")) {
      let sessionValue = 0;
      let sessionStart = 0;
      let sessionEnd = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
          if (shift.hadRecentInput) continue;
          if (sessionValue && entry.startTime - sessionEnd < 1000 && entry.startTime - sessionStart < 5000) {
            sessionValue += shift.value;
            sessionEnd = entry.startTime;
          } else {
            sessionValue = shift.value;
            sessionStart = entry.startTime;
            sessionEnd = entry.startTime;
          }
          target.__reprolensVitals.cls = Math.max(target.__reprolensVitals.cls, sessionValue);
        }
      }).observe({ type: "layout-shift", buffered: true });
    }
    if (PerformanceObserver.supportedEntryTypes?.includes("event")) {
      const interactions = new Map<number, number>();
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const event = entry as PerformanceEntry & { duration: number; interactionId?: number };
          if (!event.interactionId) continue;
          interactions.set(event.interactionId, Math.max(interactions.get(event.interactionId) ?? 0, event.duration));
        }
        const durations = [...interactions.values()].sort((a, b) => b - a);
        target.__reprolensVitals.inpMs = durations[Math.min(Math.floor(durations.length / 50), durations.length - 1)];
      }).observe({ type: "event", buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
    }
  });
}

async function collectWebVitals(page: Page): Promise<WebVitals> {
  return page.evaluate(() => {
    const observed = (window as unknown as { __reprolensVitals?: { lcpMs?: number; cls: number; inpMs?: number } }).__reprolensVitals;
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const paints = performance.getEntriesByType("paint");
    const fcp = paints.find((entry) => entry.name === "first-contentful-paint")?.startTime;
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    return {
      lcpMs: observed?.lcpMs === undefined ? undefined : Math.round(observed.lcpMs),
      cls: Math.round((observed?.cls ?? 0) * 1000) / 1000,
      inpMs: observed?.inpMs === undefined ? undefined : Math.round(observed.inpMs),
      fcpMs: fcp === undefined ? undefined : Math.round(fcp),
      ttfbMs: navigation ? Math.round(navigation.responseStart - navigation.startTime) : undefined,
      domContentLoadedMs: navigation ? Math.round(navigation.domContentLoadedEventEnd - navigation.startTime) : undefined,
      loadMs: navigation ? Math.round(navigation.loadEventEnd - navigation.startTime) : undefined,
      resourceCount: resources.length,
      transferSizeKb: Math.round(resources.reduce((total, entry) => total + entry.transferSize, 0) / 102.4) / 10
    };
  });
}

async function collectAxeViolations(page: Page): Promise<AxeViolation[]> {
  try {
    await page.evaluate(axeCore.source);
    return await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (root: Document, options: unknown) => Promise<{ violations: AxeViolation[] }> } }).axe;
      const results = await axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
        resultTypes: ["violations"]
      });
      return results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        helpUrl: violation.helpUrl,
        description: violation.description,
        nodes: violation.nodes.slice(0, 5).map((node) => {
          const selector = node.target[0];
          let box;
          try {
            const element = selector ? document.querySelector(selector) : null;
            const rect = element?.getBoundingClientRect();
            if (rect?.width && rect.height) box = { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
          } catch {
            box = undefined;
          }
          return { target: node.target, html: node.html.slice(0, 500), failureSummary: node.failureSummary, box };
        })
      }));
    });
  } catch {
    return [];
  }
}


async function auditPage(
  page: Page,
  device: DeviceName,
  consoleErrors: string[],
  networkErrors: Array<{ url: string; status: number }>,
  pageErrors: string[]
): Promise<AuditSnapshot> {
  const viewport = devices[device];
  const domAudit = await page.evaluate(() => {
    const inspected = Array.from(
      document.querySelectorAll<HTMLElement>("main *, img:not([alt]), button, input, textarea, select")
    ).map((element) => {
      const testId = element.getAttribute("data-testid");
      const box = element.getBoundingClientRect();
      return {
        element,
        selector: element.id ? `#${CSS.escape(element.id)}` : testId ? `[data-testid="${testId}"]` : element.tagName.toLowerCase(),
        box: box.width && box.height
          ? { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) }
          : undefined
      };
    });
    const missingAlt = inspected
      .filter(({ element }) => element.matches("img:not([alt])"))
      .map(({ selector, box }) => ({ selector, box }));
    const unlabeledControls = inspected
      .filter(({ element }) => element.matches("button, input, textarea, select"))
      .filter(({ element }) => {
        const text = (element.innerText || element.getAttribute("value") || "").trim();
        const label = element.getAttribute("aria-label") || element.getAttribute("title");
        const linked = element.id && document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        return !text && !label && !linked;
      })
      .map(({ selector, box }) => ({ selector, box }));
    const clippedElements = inspected
      .filter(({ element }) => element.matches("main *"))
      .filter(({ element }) => {
        const style = getComputedStyle(element);
        const clips = ["hidden", "clip"].includes(style.overflow) || ["hidden", "clip"].includes(style.overflowX);
        return clips && (element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2);
      })
      .slice(0, 10)
      .map(({ selector, box }) => ({ selector, box }));
    return {
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      missingAlt,
      unlabeledControls,
      clippedElements
    };
  });
  const [axeViolations, vitals] = await Promise.all([collectAxeViolations(page), collectWebVitals(page)]);

  return {
    device,
    viewport: { width: viewport.width, height: viewport.height },
    ...domAudit,
    consoleErrors,
    networkErrors,
    pageErrors,
    axeViolations,
    vitals
  };
}

export class BrowserScanner {
  constructor(private readonly provider: DeepSeekProvider) {}

  async scan(runId: string, input: CreateRunInput, callbacks: ScannerCallbacks): Promise<ScanResult> {
    const startedAt = Date.now();
    const findings: Finding[] = [];
    const screenshots: ScreenshotArtifact[] = [];
    const evidence: StepEvidence[] = [];
    let consoleErrorCount = 0;
    let networkErrorCount = 0;
    const qualityMetrics: Array<{ device: DeviceName; vitals: WebVitals }> = [];
    const artifactDir = path.join(config.artifactsDir, runId);
    await fs.mkdir(artifactDir, { recursive: true });

    if (!input.plan || !input.planConfirmed) {
      const business = businessReport(input, []);
      return {
        findings, screenshots, score: 100, verdict: "inconclusive", business,
        summary: "证据不足：尚未确认业务复现计划。请在工作台生成并确认步骤，系统不会猜测操作或用页面质量问题代替复现。",
        generatedTest: generateBusinessTest(input), provider: "deterministic",
        durationMs: Date.now() - startedAt, consoleErrors: 0, networkErrors: 0,
        accessibilityIssues: 0, performanceIssues: 0, qualityMetrics
      };
    }

    await callbacks.step("启动隔离浏览器", "Chromium / Playwright");
    const browser = await chromium.launch({ headless: config.headless, channel: config.browserChannel });

    try {
      for (const deviceName of input.devices) {
        const device = devices[deviceName];
        await callbacks.step(`加载 ${device.label}`, `${device.width} × ${device.height}`);
        const context = await browser.newContext({
          viewport: { width: device.width, height: device.height },
          deviceScaleFactor: 1,
          colorScheme: "dark"
        });
        const page = await context.newPage();
        await installPerformanceObservers(page);
        const consoleErrors: string[] = [];
        const pageErrors: string[] = [];
        const networkErrors: Array<{ url: string; status: number }> = [];
        page.on("console", (message) => {
          if (message.type() === "error") consoleErrors.push(message.text());
        });
        page.on("pageerror", (error) => pageErrors.push(error.message));
        page.on("response", (response) => {
          if (response.status() >= 400) networkErrors.push({ url: response.url(), status: response.status() });
        });

        await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(350);
        await callbacks.step("执行已确认的业务复现计划", input.plan.objective);
        evidence.push(...await executePlan(page, input.plan, deviceName, artifactDir, runId, async (item) => {
          await callbacks.evidence?.(item);
        }));
        await page.waitForTimeout(300);

        const filename = `${deviceName}.png`;
        await page.screenshot({ path: path.join(artifactDir, filename), fullPage: true, mask: [page.locator('input[type="password"]')], timeout: 4000 });
        const screenshot: ScreenshotArtifact = {
          id: `${runId}-${deviceName}`,
          label: `${device.label} · 操作后`,
          device: deviceName,
          viewport: { width: device.width, height: device.height },
          url: `/artifacts/${runId}/${filename}`
        };
        screenshots.push(screenshot);
        await callbacks.screenshot(screenshot);

        const audit = await auditPage(page, deviceName, consoleErrors, networkErrors, pageErrors);
        qualityMetrics.push({ device: deviceName, vitals: audit.vitals! });
        const deviceFindings = buildFindings(audit);
        consoleErrorCount += consoleErrors.length + pageErrors.length;
        networkErrorCount += networkErrors.length;
        for (const finding of deviceFindings) {
          findings.push(finding);
          await callbacks.finding(finding);
        }
        await context.close();
      }
    } finally {
      await browser.close();
    }

    await callbacks.step("汇总业务断言与附加质量报告", `${evidence.length} 条步骤证据`);
    const business = businessReport(input, evidence);
    const verdict = reportVerdict(business);
    const label = verdict === "reproduced" ? "目标问题已复现" : verdict === "not_reproduced" ? "此路径未复现" : "证据不足";
    const failure = evidence.find((item) => item.status === "failed" || item.status === "blocked");

    return {
      findings,
      screenshots,
      score: calculateScore(findings),
      verdict,
      business,
      summary: `${label}。核心检查覆盖 ${business.covered}/${business.total}。${failure ? failure.title + "：" + failure.actual : input.plan.scope}。页面质量问题不参与业务结论。`,
      generatedTest: generateBusinessTest(input),
      provider: this.provider.configured ? "deepseek" : "deterministic",
      durationMs: Date.now() - startedAt,
      consoleErrors: consoleErrorCount,
      networkErrors: networkErrorCount,
      accessibilityIssues: findings.filter((finding) => finding.category === "accessibility").length,
      performanceIssues: findings.filter((finding) => finding.category === "performance").length,
      qualityMetrics
    };
  }
}
