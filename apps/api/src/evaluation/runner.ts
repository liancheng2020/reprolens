import { randomUUID, createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { executePlan, deviceVerdict, viewports } from "../business.js";
import { generateBusinessTest } from "../business-test.js";
import { config, projectRoot } from "../config.js";
import { reproPlanSchema } from "../repro-plan.js";
import { evalCases, selectCases } from "./cases.js";
import { startFixtureServer } from "./fixtures.js";
import { summarize, type EvalReport, type ReplayResult } from "./report.js";

const require = createRequire(import.meta.url);
const playwrightCli = path.join(path.dirname(require.resolve("playwright/package.json")), "cli.js");

interface TestResult { status: string; error?: { message?: string; location?: { line?: number } } }
interface TestSuite { suites?: TestSuite[]; specs?: Array<{ tests: Array<{ results: TestResult[] }> }> }

// A nonzero exit alone is NOT proof of the seeded bug: inspect the assertion failure.
export function classifyReplay(json: { suites?: TestSuite[]; errors?: unknown[] }, exitCode: number | null, fixed: boolean, failureLine: number): ReplayResult {
  const tests: TestResult[] = [];
  const visit = (suite: TestSuite) => { suite.specs?.forEach(s => s.tests.forEach(t => tests.push(...t.results))); suite.suites?.forEach(visit); };
  json.suites?.forEach(visit);
  const result = tests[0];
  const valid = !json.errors?.length && tests.length === 1;
  const message = (result?.error?.message ?? "").replace(/\u001b\[[0-9;]*m/g, "");
  const seededFailure = /toHaveValue/.test(message) && /Expected:\s*"repro-test"/.test(message)
    && /Received:\s*""/.test(message) && result?.error?.location?.line === failureLine;
  const actual = valid && result?.status === "passed" && exitCode === 0 ? "passed"
    : valid && result?.status === "failed" && exitCode === 1 && seededFailure ? "failed" : "error";
  const expected = fixed ? "passed" : "failed";
  return { fixed, expected, actual, passed: actual === expected, error: actual === "error" ? (result?.error?.message ?? "回归进程或报告异常").slice(0, 1500) : undefined };
}

async function replay(dir: string, origin: string, fixed: boolean, failureLine: number): Promise<ReplayResult> {
  const reportPath = path.join(dir, fixed ? "replay-fixed.json" : "replay-bug.json");
  const exitCode = await new Promise<number | null>(resolve => {
    execFile(process.execPath, [playwrightCli, "test", "--config", path.join(dir, "playwright.config.ts")], {
      cwd: projectRoot, timeout: 45_000, maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, REPROLENS_TARGET_URL: `${origin}/demo/eval/blur?fixed=${fixed ? 1 : 0}`, PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath }
    }, error => resolve(error ? typeof error.code === "number" ? error.code : null : 0));
  });
  try { return classifyReplay(JSON.parse(await fs.readFile(reportPath, "utf8")), exitCode, fixed, failureLine); }
  catch { return { fixed, expected: fixed ? "passed" : "failed", actual: "error", passed: false, error: "回归测试没有生成有效报告；请检查浏览器安装或进程超时" }; }
}

export function newReport(suite: "smoke" | "full"): EvalReport {
  const id = randomUUID();
  return { id, version: 1, datasetVersion: "1", suite, mode: "deterministic-executor", status: "running", startedAt: new Date().toISOString(),
    total: selectCases(suite).length, results: [], replay: [], artifactsUrl: `/artifacts/eval-${id}` };
}

export async function runEvaluation(report: EvalReport, update: (report: EvalReport) => Promise<void> = async () => {}) {
  const dir = path.join(config.artifactsDir, `eval-${report.id}`);
  const persist = async () => { await fs.writeFile(path.join(dir, "report.json"), JSON.stringify(report, null, 2)); await update(report); };
  let fixtures: Awaited<ReturnType<typeof startFixtureServer>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const channel = process.env.REPROLENS_EVAL_CHANNEL;
  try {
    await fs.mkdir(dir, { recursive: true });
    await persist();
    fixtures = await startFixtureServer();
    if (channel && channel !== "chrome") throw new Error("REPROLENS_EVAL_CHANNEL 仅支持 chrome；留空使用 Playwright Chromium");
    browser = await chromium.launch({ headless: true, channel });
    const browserVersion = browser.version();
    for (const item of selectCases(report.suite)) {
      const started = Date.now();
      const context = await browser.newContext({ viewport: viewports.desktop });
      try {
        const page = await context.newPage();
        // The evaluator never navigates to user-provided sites or invokes an LLM.
        await context.route("**/*", route => new URL(route.request().url()).origin === fixtures!.origin ? route.continue() : route.abort());
        await page.goto(`${fixtures.origin}/demo/eval/${item.fixture}?fixed=${item.fixed ? 1 : 0}`, { waitUntil: "domcontentloaded", timeout: 10_000 });
        const caseDir = path.join(dir, item.id);
        await fs.mkdir(caseDir, { recursive: true });
        const steps = await executePlan(page, reproPlanSchema.parse(item.plan), "desktop", caseDir, `eval-${report.id}/${item.id}`, async () => {});
        const actual = deviceVerdict(steps);
        const statusMatches = item.expectedStatus === "passed" ? steps.every(step => step.status === "passed") : steps.some(step => step.status === item.expectedStatus);
        const safe = item.id !== "danger-bug" || await page.locator("body").getAttribute("data-action-executed") !== "true";
        report.results.push({ id: item.id, title: item.title, expected: item.expected, actual, passed: actual === item.expected && statusMatches && safe, steps, durationMs: Date.now() - started });
      } catch (error) {
        report.results.push({ id: item.id, title: item.title, expected: item.expected, actual: "error", passed: false, steps: [], durationMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) });
      } finally { await context.close(); }
      await persist();
    }
    await browser.close(); browser = undefined;
    const plan = evalCases.find(item => item.id === "blur-bug")!.plan;
    const code = generateBusinessTest({ url: `${fixtures.origin}/demo/eval/blur`, issue: plan.objective, expected: "输入后失焦仍保留值", devices: ["desktop"], plan, planConfirmed: true }, true);
    await fs.writeFile(path.join(dir, "regression.spec.ts"), code);
    await fs.writeFile(path.join(dir, "playwright.config.ts"), `export default { testDir: ".", testMatch: "regression.spec.ts", workers: 1, retries: 0, reporter: [["json"]], use: ${JSON.stringify({ headless: true, channel })}, outputDir: "test-output" };`);
    await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify({ datasetVersion: report.datasetVersion, plan, generatedTestSha256: createHash("sha256").update(code).digest("hex"), node: process.version, browser: channel ?? "chromium", browserVersion, modelCalls: 0 }, null, 2));
    const failureLine = code.split("\n").reduce((last, line, index) => line.includes(".toHaveValue(") ? index + 1 : last, 0);
    for (const fixed of [false, true]) { report.replay.push(await replay(dir, fixtures.origin, fixed, failureLine)); await persist(); }
    report.status = "completed";
    report.passed = report.results.length === report.total && report.results.every(r => r.passed) && report.replay.length === 2 && report.replay.every(r => r.passed);
  } catch (error) {
    report.status = "failed"; report.passed = false;
    report.error = error instanceof Error ? error.message : String(error);
  } finally {
    await browser?.close().catch(() => {});
    await fixtures?.close().catch(() => {});
    report.finishedAt = new Date().toISOString();
    report.metrics = summarize(report.results);
    await persist();
  }
  return report;
}
