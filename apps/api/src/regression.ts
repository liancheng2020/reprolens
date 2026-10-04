import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { config, projectRoot } from "./config.js";
import { demoScenarios } from "./demo-scenarios.js";
import { generateBusinessTest } from "./business-test.js";
import { reproPlanSchema } from "./repro-plan.js";
import type { RegressionReport, ReproRun } from "./types.js";

const require = createRequire(import.meta.url);
const playwrightCli = path.join(path.dirname(require.resolve("playwright/package.json")), "cli.js");

export function canVerifyDemoRegression(baseline: ReproRun, current: ReproRun): boolean {
  const demo = demoScenarios.find(item => item.id === baseline.input.demoId);
  if (!demo?.plan || baseline.verdict !== "reproduced" || current.verification?.business?.status !== "fixed") return false;
  if (!isDeepStrictEqual(baseline.input.plan, reproPlanSchema.parse(demo.plan)) ||
      !isDeepStrictEqual(baseline.input.devices, demo.devices) ||
      !isDeepStrictEqual(current.input.plan, baseline.input.plan) ||
      !isDeepStrictEqual(current.input.devices, baseline.input.devices)) return false;
  try {
    const bug = new URL(baseline.input.url), fixed = new URL(current.input.url);
    const expected = new URL(demo.path, bug.origin);
    const origins = [`http://127.0.0.1:${config.port}`, `http://localhost:${config.port}`];
    if (!origins.includes(bug.origin) || bug.username || bug.password || fixed.username || fixed.password || bug.href !== expected.href) return false;
    expected.searchParams.set("fixed", "1");
    return fixed.href === expected.href && baseline.generatedTest === generateBusinessTest(baseline.input, true);
  } catch { return false; }
}

interface TestResult { status: string; error?: { message?: string; location?: { file?: string; line?: number } } }
interface Suite { suites?: Suite[]; specs?: Array<{ title: string; tests: Array<{ results: TestResult[] }> }> }
interface ReplayJson { suites?: Suite[]; errors?: unknown[] }

// A bug replay must fail at the original core assertion, not browser launch or navigation.
export function gradeDemoReplay(report: ReplayJson, exitCode: number | null, baseline: ReproRun, fixed: boolean, code: string): boolean {
  const specs: NonNullable<Suite["specs"]> = [];
  const visit = (suite: Suite) => { specs.push(...(suite.specs ?? [])); suite.suites?.forEach(visit); };
  report.suites?.forEach(visit);
  if (report.errors?.length || specs.length !== baseline.input.devices.length || exitCode !== (fixed ? 0 : 1)) return false;
  const lines = code.split("\n");
  const assertionLines = (index: number, device: string) => {
    const testStart = lines.findIndex(line => line.startsWith("test(" + JSON.stringify(`${device} · ${baseline.input.plan!.objective}`)));
    const start = lines.findIndex((line, position) => position > testStart && line === "  // " + baseline.input.plan!.steps[index]!.title);
    if (testStart < 0 || start < 0) return [];
    let end = lines.findIndex((line, position) => position > start && (line.startsWith("  // ") || line === "});"));
    if (end < 0) end = lines.length;
    return lines.slice(start + 1, end).flatMap((line, offset) =>
      /await expect(?:\.poll)?\(/.test(line) && /\.(?:toHaveValue|toHaveText|toBeVisible|toBeHidden|toBeEnabled|toBeEditable|toBe)\(/.test(line)
        ? [start + offset + 2] : []);
  };
  return baseline.input.devices.every(device => {
    const matches = specs.filter(spec => spec.title === `${device} · ${baseline.input.plan?.objective}`);
    if (matches.length !== 1 || matches[0]!.tests.length !== 1 || matches[0]!.tests[0]!.results.length !== 1) return false;
    const result = matches[0]!.tests[0]!.results[0]!;
    const failed = baseline.business?.steps.filter(step => step.device === device && step.phase === "check" && step.status === "failed") ?? [];
    if (fixed || !failed.length) return result.status === "passed";
    const location = result.error?.location;
    return result.status === "failed" && Boolean(location?.file?.endsWith("regression.spec.ts")) &&
      failed.some(step => assertionLines(step.index, device).includes(location?.line ?? -1));
  });
}

export async function verifyDemoRegression(baseline: ReproRun, current: ReproRun): Promise<RegressionReport> {
  if (!canVerifyDemoRegression(baseline, current)) throw new Error("仅支持未修改计划的内置双版本示例");
  const code = baseline.generatedTest!;
  const dir = path.join(config.artifactsDir, current.id, "regression");
  const artifactsUrl = `/artifacts/${current.id}/regression`;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "regression.spec.ts"), code);
  await fs.writeFile(path.join(dir, "playwright.config.ts"), `export default ${JSON.stringify({
    testDir: ".", testMatch: "regression.spec.ts", workers: 1, retries: 0, reporter: [["json"]],
    use: { headless: true, channel: config.browserChannel }, outputDir: "test-output"
  })};`);
  const result: RegressionReport = { status: "failed", baselineRunId: baseline.id,
    testSha256: createHash("sha256").update(code).digest("hex"), testUrl: `${artifactsUrl}/regression.spec.ts`, results: [], summary: "" };
  for (const fixed of [false, true]) {
    const version = fixed ? "fixed" : "bug";
    const reportPath = path.join(dir, `replay-${version}.json`);
    const exitCode = await new Promise<number | null>(resolve => {
      execFile(process.execPath, [playwrightCli, "test", "--config", path.join(dir, "playwright.config.ts")], {
        cwd: projectRoot, timeout: 60_000, maxBuffer: 2 * 1024 * 1024,
        env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
          NODE_PATH: path.join(projectRoot, "node_modules"),
          REPROLENS_TARGET_URL: fixed ? current.input.url : baseline.input.url, PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath }
      }, error => resolve(error ? typeof error.code === "number" ? error.code : null : 0));
    });
    try {
      const report = JSON.parse(await fs.readFile(reportPath, "utf8")) as ReplayJson;
      const passed = gradeDemoReplay(report, exitCode, baseline, fixed, code);
      result.results.push({ version, passed, reportUrl: `${artifactsUrl}/replay-${version}.json`,
        detail: passed ? fixed ? "全部设备测试通过" : "在原核心断言处检出缺陷，其他设备通过" : "报告未满足双版本验证标准；请查看测试报告" });
    } catch {
      result.status = "error";
      result.results.push({ version, passed: false, reportUrl: "", detail: "测试进程未生成有效报告，可能超时或启动失败" });
    }
  }
  if (result.results.every(item => item.passed)) result.status = "verified";
  result.summary = result.status === "verified" ? "同一份导出测试：缺陷版在目标断言失败，修复版全部通过。" : "导出测试尚未验证通过；不影响上方业务修复结论。";
  await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify({ ...result, node: process.version,
    browser: config.browserChannel ?? "chromium", devices: baseline.input.devices, verifiedAt: new Date().toISOString() }, null, 2));
  return result;
}
