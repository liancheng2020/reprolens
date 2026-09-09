// UI smoke checks with mocked API; no live tasks or paid model calls.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { preview } from "vite";
const app = await preview({ configFile: false, root: "apps/web", preview: { host: "127.0.0.1", port: 0, open: false } });
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  let submitted;
  const gate = { enabled: false, minScore: 70, maxHighSeverityFindings: 0, maxAccessibilityIssues: 10, maxPerformanceIssues: 10 };
  const plan = { version: 1, objective: "输入框无法输入", scope: "输入后保留测试值", warnings: [], steps: [
    { title: "确认注册页", action: "assert", phase: "setup", assertion: "visible", target: { by: "text", value: "注册" }, allowSideEffect: false },
    { title: "验证输入", action: "input", phase: "check", target: { by: "label", value: "手机号" }, value: "12345", allowSideEffect: false }
  ] };
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    let body = [];
    if (url.pathname === "/api/config") body = { provider: "deterministic", model: null, qualityGate: gate, github: { configured: false }, demoUrl: "http://localhost/demo/shop" };
    if (url.pathname === "/api/plans") body = plan;
    if (url.pathname === "/api/runs" && route.request().method() === "POST") {
      submitted = route.request().postDataJSON();
      body = { id: "00000000-0000-4000-8000-000000000001", createdAt: new Date().toISOString(), status: "completed", currentStep: "完成",
        input: submitted, provider: "deterministic", verdict: "inconclusive", summary: "测试桩结果", timeline: [], findings: [], screenshots: [],
        metrics: { durationMs: 0, consoleErrors: 0, networkErrors: 0, accessibilityIssues: 0, testedDevices: 3 },
        business: { version: 1, steps: [], devices: [], covered: 0, total: 3, testStatus: "draft" } };
    }
    await route.fulfill({ json: body });
  });
  const address = app.httpServer.address();
  await page.goto("http://127.0.0.1:" + address.port);
  await page.getByRole("heading", { name: "验证工作台", exact: true }).waitFor();
  assert.equal(await page.getByPlaceholder("https://your-app.example.com").inputValue(), "");
  await page.getByPlaceholder("https://your-app.example.com").fill("http://localhost:8000/account/login");
  await page.getByPlaceholder("描述操作步骤和实际遇到的问题").fill("注册页面手机号输入框无法输入");
  await page.getByPlaceholder("描述完成操作后应出现的结果").fill("手机号输入后应保留");
  await page.getByRole("button", { name: "生成复现计划", exact: true }).click();
  const execute = page.getByRole("button", { name: "按确认计划执行", exact: true });
  await execute.waitFor();
  assert.equal(await execute.isDisabled(), true);
  await page.getByPlaceholder("描述完成操作后应出现的结果").fill("输入的手机号应能保留");
  assert.equal(await execute.count(), 0);
  await page.getByRole("button", { name: "生成复现计划", exact: true }).click();
  await execute.waitFor();
  await page.getByRole("checkbox", { name: /我已核对目标页面/ }).check();
  assert.equal(await execute.isEnabled(), true);
  await execute.click();
  await page.getByRole("heading", { name: "运行详情", exact: true }).waitFor();
  assert.equal(submitted.planConfirmed, true);
  assert.equal(submitted.plan.steps[1].value, "12345");
  await page.getByRole("button", { name: "编辑计划并重新复现", exact: true }).click();
  await page.getByRole("heading", { name: "确认要测的场景与结果", exact: true }).waitFor();
  assert.equal(await execute.isDisabled(), true);
  console.log("PASS: empty defaults, plan preview, confirmation gate, request invalidation, payload, replan retention");
} finally {
  await browser?.close();
  await new Promise(resolve => app.httpServer.close(resolve));
}

