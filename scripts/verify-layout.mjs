// npm run build && node scripts/verify-layout.mjs (mocked API, layout checks only)
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { preview } from "vite";
const config = { provider: "deterministic", model: null, github: { configured: false }, qualityGate: { enabled: false } };
const run = {
  id: "layout-test", createdAt: "2026-09-10T00:00:00Z", status: "completed", verdict: "reproduced",
  input: { url: "http://localhost/layout", issue: "布局验证用任务", expected: "卡片对齐", devices: ["desktop"] },
  provider: "deterministic", summary: "仅用于布局测试", screenshots: [], findings: [],
  timeline: [{ id: "1", at: "2026-09-10T00:00:00Z", title: "步骤完成", state: "success" }],
  metrics: { durationMs: 0, consoleErrors: 0, networkErrors: 0, accessibilityIssues: 0, testedDevices: 1 }
};
run.findings = Array.from({ length: 6 }, (_, index) => ({ id: String(index), device: "desktop", category: "accessibility", severity: "high", title: "可访问性问题 " + index, description: "问题描述", evidence: "检查证据", recommendation: "修复建议" }));
run.generatedTest = "// 示例回归测试\n".repeat(100);
run.timeline = Array.from({ length: 30 }, (_, index) => ({ ...run.timeline[0], id: String(index) }));
const app = await preview({ configFile: false, root: "apps/web", preview: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === "/api/config" ? config : path === "/api/runs" ? [run] : path.startsWith("/api/runs/") ? run : [] });
  });
  await page.goto("http://127.0.0.1:" + app.httpServer.address().port);
  await page.locator(".run-row").first().click();
  await page.locator(".finding-card").first().waitFor();
  assert.equal(await page.locator(".findings-panel details").count(), 0);
  for (const width of [1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    const dimensions = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      return {
        inspect: rect(".browser-panel").height - rect(".timeline-panel").height,
        results: rect(".findings-panel").height - rect(".code-panel").height,
        padding: (rect(".findings-panel").bottom - rect(".finding-list").bottom) - (rect(".code-panel").bottom - rect(".code-panel pre").bottom)
      };
    });
    for (const [key, difference] of Object.entries(dimensions)) assert.ok(Math.abs(difference) < 1, key + ": " + difference);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log("PASS: findings expanded, equal desktop card heights and bottom padding, mobile width, no page errors");
} finally {
  await browser?.close();
  await new Promise(resolve => app.httpServer.close(resolve));
}
