import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const origin = process.env.REPROLENS_TEST_URL ?? "http://127.0.0.1:8787";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const dir = path.resolve(`artifacts/workflow-qa-${Date.now()}`);
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.REPROLENS_BROWSER_CHANNEL });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", error => errors.push(error.message));
  const demos = await (await page.request.get(`${origin}/api/demos`)).json();
  const sample = { ...demos[2], url: `${origin}${demos[2].path}`, planConfirmed: true };
  assert.equal((await page.request.post(`${origin}/api/runs`, { data: { ...sample, devices: ["desktop", "desktop"] } })).status(), 422);
  assert.equal((await page.request.post(`${origin}/api/runs`, { data: { ...sample, url: "http://user:password@localhost/test" } })).status(), 422);
  assert.equal((await page.request.post(`${origin}/api/runs`, { data: { ...sample, url: "not-a-url" } })).status(), 422);
  assert.equal((await page.request.post(`${origin}/api/runs`, { data: "{invalid", headers: { "Content-Type": "application/json" } })).status(), 400);
  assert.equal((await page.request.post(`${origin}/api/runs`, { data: " ".repeat(270000), headers: { "Content-Type": "application/json" } })).status(), 413);
  await page.goto(origin);
  await page.getByRole("heading", { name: "缺陷复现与修复验证", exact: true }).waitFor();
  await page.getByRole("button", { name: "交互：输入失焦后内容丢失", exact: true }).click();
  await page.getByRole("checkbox", { name: /我已核对目标页面/ }).check();
  const created = page.waitForResponse(response => response.url().endsWith("/api/runs") && response.request().method() === "POST");
  await page.getByRole("button", { name: "按确认计划执行", exact: true }).click();
  const waitRun = async id => {
    const deadline = Date.now() + 160_000;
    while (Date.now() < deadline) {
      const run = await (await page.request.get(`${origin}/api/runs/${id}`)).json();
      assert.notEqual(run.status, "failed", run.error);
      if (run.status === "completed") return run;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error("Run timed out");
  };
  const bug = await waitRun((await (await created).json()).id);
  assert.equal(bug.verdict, "reproduced");
  assert.equal(bug.planning.source, "demo");
  assert.equal(bug.provider, "deterministic");
  await page.getByRole("heading", { name: "已复现", exact: true }).waitFor();
  assert.equal(await page.locator(".business-step.failed[open]").count(), 1);
  assert.equal(await page.locator(".business-step.failed img").count(), 2);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(dir, "bug-desktop.png"), fullPage: true });
  const verified = page.waitForResponse(response => response.url().endsWith("/verify") && response.request().method() === "POST");
  await page.getByRole("button", { name: "验证修复", exact: true }).click();
  const fixed = await waitRun((await (await verified).json()).id);
  assert.equal(fixed.verification.business.status, "fixed");
  assert.equal(fixed.regression.status, "verified");
  assert.equal(fixed.planning.id, bug.planning.id);
  await page.getByText("导出测试已验证", { exact: true }).waitFor();
  assert.equal(await page.locator(".run-support[open]").count(), 0);
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(dir, `fixed-${name}.png`), fullPage: true });
    const overflow = await page.evaluate(() => [...document.querySelectorAll("*")].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 10).map(el => ({ tag: el.tagName, className: el.className, width: el.getBoundingClientRect().width })));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} overflow: ${JSON.stringify(overflow)}`);
  }
  await page.reload();
  await page.getByRole("button", { name: /运行记录/ }).click();
  await page.locator(".run-row").first().click();
  await page.getByText("导出测试已验证", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(dir, "report.json"), JSON.stringify({ modelCalls: 0, apiValidation: ["duplicate-devices", "credential-url", "invalid-url", "malformed-json", "oversized-body"], bugRunId: bug.id, fixedRunId: fixed.id, regression: fixed.regression, errors }, null, 2));
  console.log(`PASS: provenance, key evidence, fix replay, exported-test validation, persistence and responsive layout. ${dir}`);
} finally { await browser.close(); }
