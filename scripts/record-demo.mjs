// npm run build && node scripts/record-demo.mjs
// Real local API + Chromium; no mocked responses, credentials or paid model calls.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { checkEncoder, convertToMp4 } from "./video.mjs";

checkEncoder();

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "docs/media");
const scratch = await mkdtemp(path.join(tmpdir(), "reprolens-recording-"));
await mkdir(output, { recursive: true });
const html = await readFile(new URL("./fixtures/registration.html", import.meta.url), "utf8");
const fixture = createServer((req, res) => {
  const fixed = new URL(req.url, "http://localhost").searchParams.get("fixed") === "1";
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html.replace("__READONLY__", fixed ? "" : "readonly").replace("__VERSION__", fixed ? "修复后 · 可正常输入" : "故障版 · 输入框只读"));
});
await new Promise(resolve => fixture.listen(0, "127.0.0.1", resolve));
const target = "http://127.0.0.1:" + fixture.address().port + "/register";
const reservation = createServer();
await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const base = "http://127.0.0.1:" + port;
const startup = `const {config}=await import('./apps/api/dist/config.js'); Object.assign(config,${JSON.stringify({ port, dataDir: path.join(scratch, "runs"), artifactsDir: path.join(scratch, "artifacts"), deepseekApiKey: "", githubToken: "", githubWebhookSecret: "", headless: true })}); await import('./apps/api/dist/server.js');`;
const api = spawn(process.execPath, ["--input-type=module", "-e", startup], {
  cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, DEEPSEEK_API_KEY: "", REPROLENS_GITHUB_TOKEN: "", GITHUB_TOKEN: "", REPROLENS_GITHUB_WEBHOOK_SECRET: "" }
});
let browser;
let context;
let video;
let startupError;
api.on("error", error => { startupError = error; });
// Drain service logs without exposing environment values in the recording.
api.stdout.resume();
api.stderr.resume();
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (startupError) throw startupError;
    if (api.exitCode !== null) throw new Error("Recording API exited: " + api.exitCode);
    try { ready = (await fetch(base + "/health")).ok; } catch {}
    if (ready) break;
    await delay(200);
  }
  assert.ok(ready, "Local API ready");
  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, recordVideo: { dir: scratch, size: { width: 1440, height: 1000 } }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  video = page.video();
  const showBusiness = () => page.locator(".business-panel").evaluate(element => window.scrollTo({ top: window.scrollY + element.getBoundingClientRect().top - 105, behavior: "instant" }));
  const chapter = async text => {
    console.log(text);
    await page.evaluate(text => {
      let label = document.getElementById("recording-caption");
      if (!label) { label = document.createElement("div"); label.id = "recording-caption"; document.body.append(label); }
      label.textContent = text;
      label.style.cssText = "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:99999;max-width:95vw;width:max-content;padding:12px 24px;border:1px solid #527b69;border-radius:12px;background:#10251ff5;color:#d7ffeb;font:600 18px/1.6 'Segoe UI',sans-serif;pointer-events:none;box-shadow:0 8px 30px #0008";
    }, text);
    await delay(2200);
  };
  await page.goto(target);
  await chapter("01 / 真实本地场景：手机号输入框只读，无法输入");
  await page.getByLabel("手机号").click();
  await page.keyboard.type("12345", { delay: 180 });
  assert.equal(await page.getByLabel("手机号").inputValue(), "");
  await delay(1800);
  await page.goto(base);
  await page.getByRole("heading", { name: "验证工作台", exact: true }).waitFor();
  await chapter("02 / 创建任务：描述业务问题，而不是泛化的页面扫描");
  await page.getByPlaceholder("https://your-app.example.com").fill(target);
  await page.getByPlaceholder("描述操作步骤和实际遇到的问题").fill("注册表单中手机号输入框无法输入，请验证键盘输入能力");
  await page.getByPlaceholder("描述完成操作后应出现的结果").fill("手机号可以输入 12345，失焦后保留该值");
  await page.getByRole("button", { name: "iPhone 13", exact: true }).click();
  await page.getByRole("button", { name: "Pixel 7", exact: true }).click();
  await chapter("本次使用无 Key 安全模板；真实执行，不演示模型规划能力");
  await page.getByRole("button", { name: "生成复现计划", exact: true }).click();
  await page.getByRole("heading", { name: "确认要测的场景与结果", exact: true }).waitFor();
  const steps = page.locator(".plan-step");
  await steps.nth(0).getByLabel("步骤目的").fill("确认注册表单可见");
  await steps.nth(0).getByLabel("准确名称 / 选择器").fill("注册表单");
  await steps.nth(1).getByLabel("步骤目的").fill("手机号应可输入并保留值");
  await steps.nth(1).getByLabel("准确名称 / 选择器").fill("手机号");
  await steps.nth(1).getByLabel("测试输入值（输入并失焦后应保留）").fill("12345");
  await chapter("03 / 人工确认：注册场景 + 唯一控件 + 核心输入检查");
  await page.getByRole("checkbox", { name: /我已核对目标页面/ }).check();
  const created = page.waitForResponse(r => new URL(r.url()).pathname === "/api/runs" && r.request().method() === "POST");
  await page.getByRole("button", { name: "按确认计划执行", exact: true }).click();
  const first = await (await created).json();
  const waitRun = async id => {
    for (let i = 0; i < 180; i++) {
      const run = await (await page.request.get(base + "/api/runs/" + id)).json();
      if (run.status === "failed") throw new Error(run.error ?? "Run failed");
      if (run.status === "completed") return run;
      await delay(500);
    }
    throw new Error("Run completion timed out");
  };
  await chapter("04 / Playwright 正在真实执行，时间线与证据实时更新");
  const failed = await waitRun(first.id);
  assert.equal(failed.verdict, "reproduced");
  await page.locator(".business-panel").scrollIntoViewIfNeeded();
  await chapter("05 / 已复现：手机号不可编辑；业务检查失败，不由页面质量分决定");
  await showBusiness();
  await delay(3000);
  await page.screenshot({ path: path.join(output, "reprolens-demo-poster.png") });
  await page.locator(".code-panel").scrollIntoViewIfNeeded();
  await chapter("06 / 交付回归测试：已生成 ≠ 已执行验证");
  await page.locator(".verification-form input").fill(target + "?fixed=1");
  const verified = page.waitForResponse(r => r.url().includes("/verify") && r.request().method() === "POST");
  await chapter("07 / 修复后重放同一份已确认计划，验证输入值能否保留");
  await page.locator(".verification-form button").click();
  const second = await (await verified).json();
  const passed = await waitRun(second.id);
  assert.equal(passed.verdict, "not_reproduced");
  assert.ok(passed.business.steps.some(step => step.phase === "check" && step.status === "passed"));
  await page.locator(".business-panel").scrollIntoViewIfNeeded();
  const check = page.locator("details.business-step").last();
  if (!(await check.evaluate(element => element.open))) await check.locator("summary").click();
  await showBusiness();
  await chapter("08 / 同一核心检查通过：此路径未复现，不代表整个网站没有 Bug");
  await delay(3500);
  await chapter("ReproLens · 真实浏览器 · 业务断言 · 可追溯证据 · 开源本地运行");
  console.log("VERIFIED: reproduced -> not_reproduced; real API, screenshots and regression template");
  await context.close();
  context = undefined;
  convertToMp4(await video.path(), path.join(output, "reprolens-demo.mp4"));
  console.log("Recording saved to docs/media/reprolens-demo.mp4");
} finally {
  await context?.close();
  await browser?.close();
  api.kill();
  await new Promise(resolve => fixture.close(resolve));
  console.log("Isolated recording evidence retained at " + scratch);
}
