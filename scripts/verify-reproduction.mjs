import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import path from "node:path";
import { chromium } from "playwright";
import { generateBusinessTest } from "../apps/api/dist/business-test.js";

const origin = new URL(process.env.REPROLENS_TEST_URL ?? "http://127.0.0.1:8787").origin;
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname), "仅支持本机服务");
const channel = process.env.REPROLENS_BROWSER_CHANNEL;
const output = fileURLToPath(new URL(`../artifacts/reproduction-qa-${Date.now()}/`, import.meta.url));
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel });
const errors = [];
const runIds = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", e => errors.push(e.message));
  const waitRun = async id => {
    runIds.push(id);
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const run = await (await page.request.get(`${origin}/api/runs/${id}`)).json();
      if (run.status === "failed") throw new Error(run.error);
      if (run.status === "completed") return run;
      await delay(500);
    }
    throw new Error(`运行超时 ${id}`);
  };
  await page.goto(origin);
  await page.getByRole("heading", { name: "Bug 复现工作台" }).waitFor();
  assert.equal(await page.locator(".sidebar nav button").count(), 2);
  assert.equal(await page.getByRole("button", { name: "评测实验室", exact: true }).isVisible(), false);
  assert.equal(await page.getByText("平均评分", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "UI：手机弹窗按钮被遮挡", exact: true }).click();
  await page.locator(".plan-editor").waitFor();
  assert.equal(await page.getByRole("button", { name: "按确认计划执行", exact: true }).isDisabled(), true);
  await page.screenshot({ path: path.join(output, "workbench.png"), fullPage: true });
  assert.equal(await page.getByLabel("附加页面质量扫描", { exact: false }).isChecked(), false);
  await page.locator(".run-form > .plan-consent input").last().check();
  const created = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/api/runs"));
  await page.getByRole("button", { name: "按确认计划执行", exact: true }).click();
  const buggy = await waitRun((await (await created).json()).id);
  assert.deepEqual(buggy.business.devices.map(d => d.verdict), ["not_reproduced", "reproduced"]);
  assert.equal(buggy.input.qualityScan, false);
  assert.equal(buggy.quality, undefined);
  assert.equal(buggy.score, undefined);
  assert.ok(buggy.findings.every(f => ["console", "network"].includes(f.category)));
  const obstruction = buggy.business.steps.find(s => s.device === "iphone13" && s.status === "failed");
  assert.equal(obstruction.title, "检查确定按钮位置与遮挡");
  assert.equal(JSON.parse(obstruction.actual).centerClear, false);
  assert.equal(JSON.parse(obstruction.actual).inViewport, true);
  await page.getByRole("heading", { name: "已复现", exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "本次复现目标", exact: true }).count(), 1);
  assert.equal(await page.getByText("附加页面质量 · 不参与目标 Bug 判定", { exact: true }).count(), 0);
  await page.screenshot({ path: path.join(output, "ui-bug-report.png"), fullPage: true });
  const fixUrl = await page.locator(".verification-form input").inputValue();
  assert.equal(new URL(fixUrl).searchParams.get("fixed"), "1");
  const verified = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/verify"));
  await page.getByRole("button", { name: "验证修复", exact: true }).click();
  const fixed = await waitRun((await (await verified).json()).id);
  assert.deepEqual(fixed.input.plan, buggy.input.plan);
  assert.deepEqual(fixed.business.devices.map(d => d.verdict), ["not_reproduced", "not_reproduced"]);
  await page.getByRole("heading", { name: "此路径未复现", exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.getByRole("button", { name: "编辑计划并重新复现", exact: true }).evaluate(el => parseFloat(getComputedStyle(el).fontSize)) > 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await page.screenshot({ path: path.join(output, "mobile-report.png"), fullPage: true });
  await page.getByRole("button", { name: "工作台", exact: true }).click();
  assert.ok(await page.getByRole("button", { name: "UI：手机弹窗按钮被遮挡", exact: true }).evaluate(el => parseFloat(getComputedStyle(el).fontSize)) > 0);
  await page.screenshot({ path: path.join(output, "mobile-workbench.png"), fullPage: true });
  await page.getByLabel("开发者工具", { exact: true }).click();
  await page.getByRole("button", { name: "评测实验室", exact: true }).click();
  await page.getByRole("heading", { name: "评测实验室", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);

  const demos = await (await page.request.get(`${origin}/api/demos`)).json();
  const profile = demos.find(d => d.id === "profile");
  const qualityResponse = await page.request.post(`${origin}/api/runs`, { data: { ...profile, url: `${origin}/demo/profile?fixed=1`, planConfirmed: true, qualityScan: true } });
  assert.equal(qualityResponse.status(), 202);
  const qualityRun = await waitRun((await qualityResponse.json()).id);
  assert.ok(qualityRun.quality?.devices.length);
  assert.equal(typeof qualityRun.score, "number");
  const runtimeResponse = await page.request.post(`${origin}/api/runs`, { data: {
    url: `${origin}/demo/shop`, issue: "点击加入购物车后没有成功反馈", expected: "购物车数量变为一", devices: ["desktop"], planConfirmed: true,
    plan: { version: 1, objective: "验证购物车反馈", scope: "仅购物车数量", warnings: [], steps: [
      { title: "确认商品页面", action: "assert", phase: "setup", assertion: "visible", target: { by: "text", value: "Focus Stand" }, allowSideEffect: false },
      { title: "加入购物车", action: "click", phase: "setup", target: { by: "role", role: "button", value: "加入购物车" }, allowSideEffect: true },
      { title: "检查数量", action: "assert", phase: "check", assertion: "text", target: { by: "css", value: "#cart-count" }, value: "1", allowSideEffect: false }
    ] }
  } });
  assert.equal(runtimeResponse.status(), 202);
  const runtimeRun = await waitRun((await runtimeResponse.json()).id);
  assert.equal(runtimeRun.verdict, "reproduced");
  assert.equal(runtimeRun.quality, undefined);
  assert.ok(runtimeRun.findings.some(f => f.category === "console"));
  assert.ok(runtimeRun.findings.some(f => f.category === "network"));
  assert.ok(runtimeRun.findings.every(f => ["console", "network"].includes(f.category)));
  const blockedPlan = structuredClone(profile.plan);
  blockedPlan.steps[0].target = { by: "text", value: "不存在的场景标识" };
  const blockedResponse = await page.request.post(`${origin}/api/runs`, { data: { ...profile, url: `${origin}/demo/profile`, plan: blockedPlan, planConfirmed: true } });
  assert.equal(blockedResponse.status(), 202);
  const blockedRun = await waitRun((await blockedResponse.json()).id);
  assert.equal(blockedRun.verdict, "inconclusive");
  assert.equal(blockedRun.quality, undefined);
  for (const version of [0, 1]) {
    const response = await page.request.post(`${origin}/api/runs`, { data: { ...profile, url: `${origin}/demo/profile?fixed=${version}`, planConfirmed: true } });
    assert.equal(response.status(), 202);
    const result = await waitRun((await response.json()).id);
    assert.equal(result.verdict, version ? "not_reproduced" : "reproduced");
  }
  const code = generateBusinessTest(buggy.input, true);
  await fs.writeFile(path.join(output, "regression.spec.ts"), code);
  await fs.writeFile(path.join(output, "playwright.config.ts"), `export default {testDir:'.',testMatch:'regression.spec.ts',workers:1,retries:0,reporter:[['json']],use:${JSON.stringify({ headless: true, channel })},outputDir:'test-output'};`);
  const require = createRequire(import.meta.url);
  const cli = path.join(path.dirname(require.resolve("playwright/package.json")), "cli.js");
  for (const version of [0, 1]) {
    const reportPath = path.join(output, `replay-${version}.json`);
    let exitCode = 0;
    try { await promisify(execFile)(process.execPath, [cli, "test", "--config", path.join(output, "playwright.config.ts")], {
      timeout: 60_000, env: { ...process.env, REPROLENS_TARGET_URL: `${origin}/demo/modal?fixed=${version}`, PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath }
    }); } catch (e) { exitCode = e.code; }
    assert.equal(exitCode, version ? 0 : 1);
    const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
    assert.equal(report.errors.length, 0);
    const results = report.suites.flatMap(s => s.specs).flatMap(s => s.tests).flatMap(t => t.results);
    assert.deepEqual(results.map(r => r.status), version ? ["passed", "passed"] : ["passed", "failed"]);
    if (!version) assert.match(results[1].error.snippet, /\.clear/);
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, runIds, output }, null, 2));
} finally { await browser.close(); }
