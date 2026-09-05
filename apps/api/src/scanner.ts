import fs from "node:fs/promises";
import path from "node:path";
import axeCore from "axe-core";
import { chromium, type Page } from "playwright";
import { buildFindings, calculateConfidence, calculateScore } from "./analyzer.js";
import { config } from "./config.js";
import { DeepSeekProvider } from "./provider.js";
import type {
  AgentAction,
  AuditSnapshot,
  AxeViolation,
  CreateRunInput,
  DeviceName,
  Finding,
  InteractiveElement,
  ScreenshotArtifact,
  WebVitals
} from "./types.js";

export const devices: Record<DeviceName, { label: string; width: number; height: number }> = {
  desktop: { label: "Desktop Chrome", width: 1440, height: 900 },
  iphone13: { label: "iPhone 13", width: 390, height: 844 },
  pixel7: { label: "Pixel 7", width: 412, height: 915 }
};

interface ScannerCallbacks {
  step(title: string, detail?: string): Promise<void>;
  screenshot(artifact: ScreenshotArtifact): Promise<void>;
  finding(finding: Finding): Promise<void>;
}

export interface ScanResult {
  findings: Finding[];
  screenshots: ScreenshotArtifact[];
  score: number;
  verdict: "reproduced" | "not_reproduced" | "inconclusive";
  confidence: number;
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
    const supports = (type: string) => PerformanceObserver.supportedEntryTypes?.includes(type);

    if (supports("largest-contentful-paint")) {
      new PerformanceObserver((list) => {
        const last = list.getEntries().at(-1);
        if (last) target.__reprolensVitals.lcpMs = last.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    }
    if (supports("layout-shift")) {
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
    if (supports("event")) {
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
    const round = (value: number | undefined, digits = 0) => value === undefined ? undefined : Number(value.toFixed(digits));
    return {
      lcpMs: round(observed?.lcpMs),
      cls: round(observed?.cls ?? 0, 3),
      inpMs: round(observed?.inpMs),
      fcpMs: round(fcp),
      ttfbMs: round(navigation ? navigation.responseStart - navigation.startTime : undefined),
      domContentLoadedMs: round(navigation ? navigation.domContentLoadedEventEnd - navigation.startTime : undefined),
      loadMs: round(navigation ? navigation.loadEventEnd - navigation.startTime : undefined),
      resourceCount: resources.length,
      transferSizeKb: round(resources.reduce((total, entry) => total + entry.transferSize, 0) / 1024, 1) ?? 0
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

async function interactiveElements(page: Page): Promise<InteractiveElement[]> {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("button, input, textarea, select, a[href]"));
    return nodes.slice(0, 50).map((node, index) => {
      const id = `rf-${index + 1}`;
      node.setAttribute("data-reprolens-id", id);
      const labelledBy = node.getAttribute("aria-labelledby");
      const linkedLabel = node.id ? document.querySelector(`label[for="${CSS.escape(node.id)}"]`)?.textContent : "";
      const ariaLabelledText = labelledBy ? document.getElementById(labelledBy)?.textContent : "";
      return {
        id,
        tag: node.tagName.toLowerCase(),
        type: node.getAttribute("type") ?? "",
        text: (node.innerText || node.textContent || "").trim().slice(0, 100),
        label: (node.getAttribute("aria-label") || linkedLabel || ariaLabelledText || "").trim().slice(0, 100),
        placeholder: (node.getAttribute("placeholder") || "").trim().slice(0, 100)
      };
    });
  });
}

async function executeActions(page: Page, actions: AgentAction[], callbacks: ScannerCallbacks): Promise<void> {
  for (const action of actions) {
    await callbacks.step(`Agent：${action.reason}`, action.type === "wait" ? `等待 ${action.value ?? "500"}ms` : action.targetId);
    try {
      if (action.type === "wait") {
        await page.waitForTimeout(Math.min(Number(action.value) || 500, 3000));
      } else if (action.targetId) {
        const target = page.locator(`[data-reprolens-id="${action.targetId}"]`).first();
        if (action.type === "fill") await target.fill(action.value ?? "");
        if (action.type === "click") await target.click({ timeout: 5000 });
      }
    } catch {
      await callbacks.step("操作未成功，继续采集当前页面证据", action.reason);
    }
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
    const selectorFor = (element: Element): string => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const testId = element.getAttribute("data-testid");
      if (testId) return `[data-testid="${testId}"]`;
      return element.tagName.toLowerCase();
    };
    const boxFor = (element: Element) => {
      const box = element.getBoundingClientRect();
      return box.width && box.height
        ? { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) }
        : undefined;
    };
    const missingAlt = Array.from(document.querySelectorAll("img:not([alt])")).map((element) => ({
      selector: selectorFor(element), box: boxFor(element)
    }));
    const unlabeledControls = Array.from(document.querySelectorAll<HTMLElement>("button, input, textarea, select"))
      .filter((element) => {
        const text = (element.innerText || element.getAttribute("value") || "").trim();
        const label = element.getAttribute("aria-label") || element.getAttribute("title");
        const linked = element.id && document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        return !text && !label && !linked;
      })
      .map((element) => ({ selector: selectorFor(element), box: boxFor(element) }));
    const clippedElements = Array.from(document.querySelectorAll<HTMLElement>("main *"))
      .filter((element) => {
        const style = getComputedStyle(element);
        const clips = ["hidden", "clip"].includes(style.overflow) || ["hidden", "clip"].includes(style.overflowX);
        return clips && (element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2);
      })
      .slice(0, 10)
      .map((element) => ({ selector: selectorFor(element), box: boxFor(element) }));
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
    let actions: AgentAction[] = [];
    let referenceElements: InteractiveElement[] = [];
    let usedDeepSeek = false;
    let consoleErrorCount = 0;
    let networkErrorCount = 0;
    const qualityMetrics: Array<{ device: DeviceName; vitals: WebVitals }> = [];
    const artifactDir = path.join(config.artifactsDir, runId);
    await fs.mkdir(artifactDir, { recursive: true });

    await callbacks.step("启动隔离浏览器", "Chromium / Playwright");
    const browser = await chromium.launch({ headless: config.headless });

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
        const elements = await interactiveElements(page);

        if (!actions.length) {
          referenceElements = elements;
          await callbacks.step("理解问题并规划复现路径", `发现 ${elements.length} 个可交互元素`);
          const plan = await this.provider.planActions(input, elements);
          actions = plan.actions;
          usedDeepSeek = plan.provider === "deepseek";
        }

        await executeActions(page, actions, callbacks);
        await page.waitForTimeout(300);

        const filename = `${deviceName}.png`;
        await page.screenshot({ path: path.join(artifactDir, filename), fullPage: true });
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

    await callbacks.step("汇总证据并生成回归测试", `${findings.length} 个结构化发现`);
    const analysis = await this.provider.analyze(input, findings, actions, referenceElements);
    usedDeepSeek = usedDeepSeek || analysis.provider === "deepseek";
    const runtimeEvidence = findings.some((finding) => finding.category === "console" || finding.category === "network");

    return {
      findings,
      screenshots,
      score: calculateScore(findings),
      verdict: runtimeEvidence ? "reproduced" : findings.length ? "inconclusive" : "not_reproduced",
      confidence: calculateConfidence(findings),
      summary: analysis.summary,
      generatedTest: analysis.generatedTest,
      provider: usedDeepSeek ? "deepseek" : "deterministic",
      durationMs: Date.now() - startedAt,
      consoleErrors: consoleErrorCount,
      networkErrors: networkErrorCount,
      accessibilityIssues: findings.filter((finding) => finding.category === "accessibility").length,
      performanceIssues: findings.filter((finding) => finding.category === "performance").length,
      qualityMetrics
    };
  }
}
