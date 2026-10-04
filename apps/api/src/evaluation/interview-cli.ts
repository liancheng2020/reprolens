import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { config } from "../config.js";
import { DeepSeekProvider, promptVersion } from "../provider.js";
import { observePage } from "../page-observation.js";
import { executePlan, deviceVerdict, locate, viewports } from "../business.js";
import type { ReproPlan } from "../types.js";
import { interviewCases, interviewFixture, type InterviewCase } from "./interview-cases.js";
import { coversInterviewOracle, summarizeInterview, type InterviewResult } from "./interview-grade.js";

// No prompt tuning or candidate editing in this runner; each candidate is replayed unchanged.
async function run() {
  const provider = new DeepSeekProvider();
  if (!provider.configured) throw new Error("需要 DEEPSEEK_API_KEY；不会把模板计为模型成功");
  const id = `interview-eval-${randomUUID()}`, dir = path.join(config.artifactsDir, id);
  await fs.mkdir(dir, { recursive: true });
  const manifest = { datasetVersion: "interview-1", promptVersion, model: config.deepseekModel, plannedCalls: 10,
    createdAt: new Date().toISOString(), node: process.version,
    datasetHash: createHash("sha256").update(JSON.stringify(interviewCases)).digest("hex"),
    limits: "10 synthetic development-validation cases, one attempt each, no prompt tuning; not a blind benchmark or real-site success rate" };
  const rows: InterviewResult[] = [];
  const persist = () => fs.writeFile(path.join(dir, "report.json"), JSON.stringify({ manifest, rows, summary: summarizeInterview(rows) }, null, 2));
  const server = createServer((req, res) => {
    const url = new URL(req.url!, "http://localhost"), item = interviewCases.find(c => url.pathname === `/${c.id}`);
    if (!item) { res.writeHead(404).end(); return; }
    res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(interviewFixture(item, url.searchParams.get("fixed") === "1"));
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("评测服务器未启动");
  const origin = `http://127.0.0.1:${address.port}`;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true, channel: config.browserChannel, timeout: 10_000 });
    for (const item of interviewCases) {
      const started = Date.now(), url = `${origin}/${item.id}`;
      const row: InterviewResult = { id: item.id, kind: item.kind, schemaValid: false, executable: false, oracleCovered: false,
        pairedPassed: false, durationMs: 0 };
      try {
        const observation = await observePage(url, item.device, [origin]);
        const { plan, trace } = await provider.createPlanDetailed({ url, issue: item.issue, expected: item.expected, devices: [item.device] }, observation, true);
        Object.assign(row, { observation, plan, trace, schemaValid: trace.status === "model" });
        if (trace.status === "model") {
          row.oracleCovered = await coversOracle(browser, item, plan);
          if (row.oracleCovered) {
            const replay = async (fixed: boolean) => {
              const context = await browser!.newContext({ viewport: viewports[item.device], serviceWorkers: "block", acceptDownloads: false });
              try {
                await context.route("**/*", route => new URL(route.request().url()).origin === origin && route.request().method() === "GET" ? route.continue() : route.abort());
                await context.routeWebSocket("**/*", socket => socket.close());
                const page = await context.newPage();
                await page.goto(`${url}?fixed=${fixed ? 1 : 0}`, { waitUntil: "domcontentloaded", timeout: 5000 });
                const part = `${item.id}-${fixed ? "fixed" : "bug"}`;
                await fs.mkdir(path.join(dir, part), { recursive: true });
                const steps = await executePlan(page, plan, item.device, path.join(dir, part), `${id}/${part}`, async () => {});
                return { verdict: deviceVerdict(steps), steps };
              } finally { await context.close(); }
            };
            row.bug = await replay(false); row.fixed = await replay(true);
            row.executable = !row.bug.steps.some(s => s.status === "blocked") && row.fixed.steps.every(s => s.status === "passed");
            row.pairedPassed = row.executable && row.bug.verdict === "reproduced" && row.fixed.verdict === "not_reproduced";
          } else row.error = "计划未覆盖预定核心检查或包含超出范围的操作，未执行";
        }
      } catch (error) { row.error = error instanceof Error ? error.message : "评测失败"; }
      row.durationMs = Date.now() - started; rows.push(row); await persist();
      console.log(`${item.id}: ${row.pairedPassed ? "paired pass" : "failed"}`);
    }
    const summary = summarizeInterview(rows);
    await fs.writeFile(path.join(dir, "summary.md"), `# 模型规划验收\n\n${JSON.stringify({ manifest, summary }, null, 2)}\n\n这是合成场景开发验证，不是盲测或真实网站成功率。所有失败保留；没有编辑候选、重试调用或调整 Prompt。token 为服务端实际返回，用量缺失不按零计；未推算费用。\n`);
    console.log(JSON.stringify({ directory: dir, summary }, null, 2));
    if (!summary.pairedPassed || summary.pairedPassed !== rows.length) process.exitCode = 1;
  } finally {
    await persist(); await browser?.close(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

async function coversOracle(browser: Awaited<ReturnType<typeof chromium.launch>>, item: InterviewCase, plan: ReproPlan): Promise<boolean> {
  if (plan.steps.length > 6 || plan.steps.some(s => s.action === "reload" || s.assertion === "response" || s.allowSideEffect)) return false;
  const context = await browser.newContext({ viewport: viewports[item.device] });
  try {
    const page = await context.newPage();
    await page.setContent(interviewFixture(item, true));
    const ids: Array<string | null | undefined> = [];
    for (const step of plan.steps) {
      const target = step.target ? locate(page, step.target) : undefined;
      if (target && await target.count() !== 1) return false;
      ids.push(target ? await target.getAttribute("id") : undefined);
    }
    return coversInterviewOracle(item, plan, ids);
  } finally { await context.close(); }
}

try { await run(); }
catch (error) { console.error(error instanceof Error ? error.message : "评测失败"); process.exitCode = 1; }
