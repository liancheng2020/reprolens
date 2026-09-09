import type { CreateRunInput, ReproTarget } from "./types.js";
import { viewports } from "./business.js";

function locator(target: ReproTarget): string {
  const value = JSON.stringify(target.value);
  if (target.by === "css") return "page.locator(" + value + ")";
  if (target.by === "role") return "page.getByRole(" + JSON.stringify(target.role) + ", { name: " + value + ", exact: true })";
  const method = { label: "getByLabel", placeholder: "getByPlaceholder", text: "getByText" }[target.by];
  return "page." + method + "(" + value + ", { exact: true })";
}

export function generateBusinessTest(input: CreateRunInput): string {
  if (!input.plan || !input.planConfirmed) return "// 测试草稿：缺少已确认的业务复现计划。请在工作台生成并确认计划。";
  const lines = [
    'import { test, expect } from "playwright/test";',
    'import type { Request, Response } from "playwright";',
    "",
    "// 此文件由已确认计划生成，尚未自动重跑验证。故障版应失败，修复版应通过。",
    "// 仅在已授权测试环境运行。与运行时一致：唯一定位、键盘输入、失焦检查、有限超时。",
    "test.setTimeout(120_000);"
  ];
  for (const device of input.devices) {
    lines.push("", "test(" + JSON.stringify(device + " · " + input.plan.objective) + ", async ({ page }) => {",
      "  await page.setViewportSize(" + JSON.stringify(viewports[device]) + ");",
      "  await page.goto(" + JSON.stringify(input.url) + ', { waitUntil: "domcontentloaded" });',
      "  const origin = new URL(page.url()).origin;",
      "  let epoch = 0;",
      "  const requestEpoch = new WeakMap<Request, number>();",
      "  const responses: Array<{ response: Response; epoch: number | undefined }> = [];",
      '  page.on("request", (request) => requestEpoch.set(request, epoch));',
      '  page.on("response", (response) => responses.push({ response, epoch: requestEpoch.get(response.request()) }));'
    );
    for (const [index, step] of input.plan.steps.entries()) {
      const v = JSON.stringify(step.value ?? "");
      const t = "target" + index;
      lines.push("", "  // " + step.title.replace(/[\r\n\u2028\u2029]/g, " "),
        "  expect(new URL(page.url()).origin).toBe(origin);");
      if (step.target) {
        lines.push("  const " + t + " = " + locator(step.target) + ";");
        if (step.action === "assert" && ["hidden", "visible"].includes(step.assertion ?? "")) {
          lines.push("  expect(await " + t + ".count()).toBeLessThanOrEqual(1);");
        } else {
          lines.push("  await expect(" + t + ").toHaveCount(1, { timeout: 4000 });",
            "  await expect(" + t + ").toBeVisible({ timeout: 4000 });",
            "  expect(await " + t + '.getAttribute("type")).not.toBe("password");');
        }
      }
      if (step.action === "click") {
        if (!step.allowSideEffect) {
          lines.push("  const isSubmit" + index + " = await " + t + '.evaluate(el => el instanceof HTMLInputElement ? ["submit", "image"].includes(el.type) : el instanceof HTMLButtonElement && el.type === "submit" && Boolean(el.form));',
            "  expect(isSubmit" + index + ").toBe(false);",
            "  expect(((await " + t + ".textContent()) ?? '') + " + JSON.stringify(" " + step.title) + ").not.toMatch(/删除|支付|购买|发送|验证码|提交|下单|delete|pay|purchase|send|submit/i);");
        }
        lines.push("  epoch++;", "  await " + t + ".click({ timeout: 4000 });", '  await page.waitForLoadState("domcontentloaded");');
      } else if (step.action === "reload") {
        lines.push("  epoch++;", '  await page.reload({ waitUntil: "domcontentloaded", timeout: 10000 });');
      } else if (step.action === "input") {
        lines.push("  epoch++;",
          "  await expect(" + t + ").toBeEnabled({ timeout: 4000 });",
          "  await expect(" + t + ").toBeEditable({ timeout: 4000 });",
          "  await " + t + ".click({ timeout: 4000 });",
          "  await expect(" + t + ").toBeFocused({ timeout: 4000 });",
          "  await " + t + '.press("ControlOrMeta+A");',
          "  await " + t + '.press("Backspace");',
          "  await " + t + ".pressSequentially(" + v + ", { delay: 30, timeout: 4000 });",
          "  await expect(" + t + ").toHaveValue(" + v + ", { timeout: 4000 });",
          "  await " + t + '.press("Tab");',
          "  await page.waitForTimeout(350);",
          "  await expect(" + t + ").toHaveValue(" + v + ", { timeout: 4000 });");
      } else if (step.assertion === "url") {
        lines.push("  await expect.poll(() => page.url(), { timeout: 4000 }).toBe(new URL(" + v + ", page.url()).href);");
      } else if (step.assertion === "response") {
        const matches = "matches" + index, response = "response" + index;
        lines.push("  const " + matches + " = () => responses.filter(item => item.epoch === epoch && epoch > 0 && new URL(item.response.url()).origin === origin && new URL(item.response.url()).pathname === " + JSON.stringify(step.requestPath) + " && item.response.request().method() === " + JSON.stringify(step.method) + ");",
          "  await expect.poll(() => " + matches + "().length, { timeout: 4000 }).toBe(1);",
          "  const " + response + " = " + matches + "()[0].response;",
          "  expect(" + response + ".status()).toBe(" + step.statusCode + ");");
        if (step.responseField) lines.push(
          "  const length" + index + " = Number(" + response + '.headers()["content-length"]);',
          "  expect(length" + index + ").toBeGreaterThan(0);", "  expect(length" + index + ").toBeLessThanOrEqual(65536);",
          "  const body" + index + " = await " + response + ".json();",
          "  expect(String(" + JSON.stringify(step.responseField) + ".split('.').reduce((item, key) => item?.[key], body" + index + "))).toBe(" + v + ");");
      } else {
        const method = { value: "toHaveValue", text: "toHaveText", visible: "toBeVisible", hidden: "toBeHidden", enabled: "toBeEnabled", editable: "toBeEditable" }[step.assertion as "value"];
        lines.push("  await expect(" + t + ")." + method + "(" + (["value", "text"].includes(step.assertion ?? "") ? v + ", " : "") + "{ timeout: 4000 });");
      }
    }
    lines.push("});");
  }
  return lines.join("\n");
}
