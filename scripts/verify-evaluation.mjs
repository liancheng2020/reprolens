import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";

// Run against a locally started API serving the built frontend.
const origin = new URL(process.env.REPROLENS_TEST_URL ?? "http://127.0.0.1:8787").origin;
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname), "仅支持本机测试服务");
const output = new URL("../artifacts/evaluation-ui/", import.meta.url);
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.REPROLENS_EVAL_CHANNEL });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin);
  await page.getByLabel("开发者工具", { exact: true }).click();
  await page.getByRole("button", { name: "评测实验室", exact: true }).click();
  await page.getByRole("button", { name: "运行评测", exact: true }).waitFor();
  assert.equal((await page.request.post(`${origin}/api/evaluations`, { data: { suite: "invalid" } })).status(), 422);
  assert.equal((await page.request.get(`${origin}/demo/eval/unknown`)).status(), 404);
  await page.getByRole("button", { name: "运行评测", exact: true }).click();
  await page.getByRole("button", { name: /运行中/ }).waitFor();
  assert.equal((await page.request.post(`${origin}/api/evaluations`, { data: { suite: "smoke" } })).status(), 409);
  await page.getByRole("heading", { name: "评测预期全部满足" }).waitFor({ timeout: 90_000 });
  const report = await (await page.request.get(`${origin}/api/evaluations/latest`)).json();
  assert.equal(report.passed, true);
  assert.equal(report.results.length, 4);
  assert.deepEqual(report.replay.map(r => r.actual), ["failed", "passed"]);
  assert.equal((await page.request.get(origin + report.artifactsUrl + "/report.json")).status(), 200);
  await page.screenshot({ path: new URL("desktop.png", output).pathname, fullPage: true });
  await page.locator(".eval-case > summary").first().click();
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `视口溢出 ${viewport.width}`);
    await page.screenshot({ path: new URL(`evidence-${viewport.width}.png`, output).pathname, fullPage: true });
  }
  for (const fixed of [0, 1]) {
    await page.goto(`${origin}/demo/eval/blur?fixed=${fixed}`);
    const input = page.getByLabel("显示名称", { exact: true });
    await input.fill("repro-test");
    await input.press("Tab");
    assert.equal(await input.inputValue(), fixed ? "repro-test" : "");
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ reportId: report.id, passed: true, screenshots: output.pathname }, null, 2));
} finally { await browser.close(); }
