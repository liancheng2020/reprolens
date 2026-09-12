import { createServer } from "node:http";
import { randomUUID, createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { config } from "../config.js";
import { DeepSeekProvider, promptVersion } from "../provider.js";
import { observePage } from "../page-observation.js";
import { executePlan, deviceVerdict, locate, viewports } from "../business.js";
import type { ReproPlan, StepEvidence } from "../types.js";

export const modelCases = [
  { id: "a", heading: "创作者名片", label: "公开署名", fault: "blur" },
  { id: "b", heading: "配送偏好", label: "收件称呼", fault: "disabled" },
  { id: "c", heading: "工作区档案", label: "空间别名", fault: "readonly" }
] as const;

export function compareFixture(item: typeof modelCases[number], fixed: boolean) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>表单</title>
    <h1>${item.heading}</h1><label for="field">${item.label}</label>
    <input id="field" ${!fixed && item.fault === "disabled" ? "disabled" : ""} ${!fixed && item.fault === "readonly" ? "readonly" : ""}>
    <script>document.querySelector('input').onblur=e=>{if(${!fixed && item.fault === "blur"})e.target.value='';};</script></html>`;
}

export function pairedSuccess(bug: { validCheck: boolean; verdict: string; steps: StepEvidence[] }, fixed: { validCheck: boolean; verdict: string; steps: StepEvidence[] }) {
  return bug.validCheck && fixed.validCheck && bug.verdict === "reproduced" && fixed.verdict === "not_reproduced"
    && bug.steps.some(s => s.phase === "check" && s.status === "failed") && fixed.steps.every(s => s.status === "passed");
}

export async function compareModels(repeats = 1) {
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 3) throw new Error("重复次数必须为 1–3");
  const provider = new DeepSeekProvider();
  if (!provider.configured) throw new Error("需要已有 DEEPSEEK_API_KEY；模型缺失不能作为对照成功");
  const id = `model-compare-${randomUUID()}`;
  const dir = path.join(config.artifactsDir, id);
  await fs.mkdir(dir, { recursive: true });
  const rows: Array<Record<string, unknown> & { mode: string; success: boolean; durationMs: number }> = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url!, "http://localhost");
    const item = modelCases.find(c => url.pathname === `/sample/${c.id}`);
    if (!item) { res.writeHead(404).end(); return; }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(compareFixture(item, url.searchParams.get("variant") === "v2"));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("测试服务器启动失败");
  const origin = `http://127.0.0.1:${address.port}`;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const manifest = { datasetVersion: "model-input-1", promptVersion, model: config.deepseekModel, repeats,
    plannedCalls: repeats * modelCases.length * 2, node: process.version, datasetHash: createHash("sha256").update(JSON.stringify(modelCases)).digest("hex"),
    limits: "3 synthetic input scenarios, desktop only; no claims about arbitrary websites or UI coverage" };
  const persist = () => fs.writeFile(path.join(dir, "report.json"), JSON.stringify({ manifest, rows }, null, 2));
  try {
    browser = await chromium.launch({ headless: true, channel: config.browserChannel, timeout: 10_000 });
    for (let repeat = 0; repeat < repeats; repeat++) for (const [caseIndex, item] of modelCases.entries()) {
      const url = `${origin}/sample/${item.id}`;
      // Alternate arm order to reduce (not eliminate) time/order effects.
      const modes = (repeat + caseIndex) % 2 ? ["observed", "baseline"] : ["baseline", "observed"];
      for (const mode of modes) {
        const started = Date.now();
        const row: typeof rows[number] = { caseId: item.id, repeat, mode, success: false, durationMs: 0 };
        try {
          const observation = mode === "observed" ? await observePage(url, "desktop", [origin]) : undefined;
          const input = { url, issue: "这个页面的名称输入框不能正常输入，或离开输入框后内容消失。", expected: "目标输入框可以通过键盘输入，并在失焦后保留输入内容。", devices: ["desktop" as const] };
          const { plan, trace } = await provider.createPlanDetailed(input, observation, true);
          Object.assign(row, { observation, trace, plan, planHash: createHash("sha256").update(JSON.stringify(plan)).digest("hex") });
          if (trace.status === "model") {
            const replay = async (fixed: boolean) => {
              const context = await browser!.newContext({ viewport: viewports.desktop, serviceWorkers: "block" });
              try {
                await context.route("**/*", route => new URL(route.request().url()).origin === origin && route.request().method() === "GET" ? route.continue() : route.abort());
                await context.routeWebSocket("**/*", socket => socket.close());
                const page = await context.newPage();
                await page.goto(url + (fixed ? "?variant=v2" : ""), { waitUntil: "domcontentloaded", timeout: 5000 });
                // Do not execute unexpected model actions; grade them as unsuccessful.
                let validCheck = plan.steps.length <= 6 && plan.steps.every(s => s.action === "assert" || s.action === "input");
                const checks = plan.steps.filter(s => s.phase === "check");
                validCheck = validCheck && checks.length > 0 && checks.every(s => s.action === "input" && Boolean(s.value));
                for (const step of checks) if (validCheck) {
                  const target = step.target ? locate(page, step.target) : undefined;
                  validCheck = Boolean(target && await target.count() === 1 && await target.getAttribute("id") === "field");
                }
                if (!validCheck) return { validCheck: false, verdict: "inconclusive", steps: [] as StepEvidence[] };
                const caseDir = path.join(dir, `${item.id}-${repeat}-${mode}-${fixed ? "fixed" : "bug"}`);
                await fs.mkdir(caseDir, { recursive: true });
                const steps = await executePlan(page, plan as ReproPlan, "desktop", caseDir, `${id}/${path.basename(caseDir)}`, async () => {});
                return { validCheck, verdict: deviceVerdict(steps), steps };
              } finally { await context.close(); }
            };
            const bug = await replay(false), fixed = await replay(true);
            Object.assign(row, { bug, fixed, success: pairedSuccess(bug, fixed) });
          }
        } catch (error) { row.error = error instanceof Error ? error.message : "执行失败"; }
        row.durationMs = Date.now() - started; rows.push(row); await persist();
        console.log(`${item.id} ${mode}: ${row.success ? "paired pass" : "failed"}`);
      }
    }
    const summary = ["baseline", "observed"].map(mode => {
      const arm = rows.filter(r => r.mode === mode);
      return { mode, passed: arm.filter(r => r.success).length, total: arm.length,
        rate: arm.length ? arm.filter(r => r.success).length / arm.length : null,
        averageMs: arm.length ? Math.round(arm.reduce((sum, r) => sum + r.durationMs, 0) / arm.length) : null };
    });
    await fs.writeFile(path.join(dir, "summary.md"), `# 小规模模型对照\n\n模型：${config.deepseekModel}；Prompt：${promptVersion}\n\n| 模式 | 双版本正确 | 总样本 | 平均端到端毫秒 |\n| --- | --- | --- | --- |\n${summary.map(s => `| ${s.mode} | ${s.passed} | ${s.total} | ${s.averageMs} |`).join("\n")}\n\n仅 3 个合成输入场景。模板降级、执行错误、错误检查目标均计为失败。不能证明真实网站成功率或统计显著性。原始计划、调用用量、观察与步骤见 report.json。\n`);
    console.log(JSON.stringify({ directory: dir, summary }, null, 2));
    return { directory: dir, summary };
  } finally { await persist(); await browser?.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
