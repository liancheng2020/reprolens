import path from "node:path";
import { expect } from "playwright/test";
import type { Locator, Page, Response } from "playwright";
import type { BusinessReport, CreateRunInput, DeviceName, ReproPlan, ReproStep, ReproTarget, StepEvidence } from "./types.js";

const TIMEOUT = 4000;
export const viewports = { desktop: { width: 1440, height: 900 }, iphone13: { width: 390, height: 844 }, pixel7: { width: 412, height: 915 } };
export function locate(page: Page, target: ReproTarget): Locator {
  if (target.by === "label") return page.getByLabel(target.value, { exact: true });
  if (target.by === "placeholder") return page.getByPlaceholder(target.value, { exact: true });
  if (target.by === "text") return page.getByText(target.value, { exact: true });
  if (target.by === "role") return page.getByRole(target.role!, { name: target.value, exact: true });
  return page.locator(target.value);
}
const clean = (value: string) => value.replace(/https?:\/\/[^\s]+/g, "[URL]").slice(0, 500);
const expectedFor = (step: ReproStep) => step.action === "input" ? "输入并失焦后值等于 " + JSON.stringify(step.value)
  : step.action === "assert" ? (step.assertion + ": " + (step.value ?? step.statusCode ?? "true"))
  : step.action === "reload" ? "重新加载当前页面" : "完成已确认的点击动作";

async function observe(page: Page, target?: Locator): Promise<string> {
  if (!target) return new URL(page.url()).pathname;
  return JSON.stringify(await target.evaluate((element) => ({
    tag: element.tagName,
    disabled: (element as HTMLInputElement).disabled ?? false,
    readonly: (element as HTMLInputElement).readOnly ?? false,
    focused: document.activeElement === element,
    value: element instanceof HTMLInputElement && element.type === "password" ? "[已隐藏]"
      : element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.value.slice(0, 200) : undefined,
    text: (element.textContent ?? "").slice(0, 100)
  }), undefined, { timeout: TIMEOUT }));
}

export function deviceVerdict(steps: StepEvidence[]): "reproduced" | "not_reproduced" | "inconclusive" {
  if (steps.some((step) => step.phase === "check" && step.status === "failed")) return "reproduced";
  const checks = steps.filter((step) => step.phase === "check");
  return checks.length && checks.every((step) => step.status === "passed") ? "not_reproduced" : "inconclusive";
}
export function businessReport(input: CreateRunInput, steps: StepEvidence[]): BusinessReport {
  const checks = steps.filter((step) => step.phase === "check");
  const perDevice = input.plan?.steps.filter((step) => step.phase === "check").length ?? 0;
  return { version: 1, steps, devices: input.devices.map((device) => {
    const deviceSteps = steps.filter((s) => s.device === device);
    const verdict = deviceVerdict(deviceSteps);
    return { device, verdict: verdict === "not_reproduced" && deviceSteps.filter((s) => s.phase === "check").length !== perDevice ? "inconclusive" : verdict };
  }),
    covered: checks.filter((step) => ["passed", "failed"].includes(step.status)).length,
    total: perDevice * input.devices.length,
    testStatus: steps.length && !steps.some((step) => ["blocked", "skipped"].includes(step.status)) ? "generated" : "draft" };
}
export function reportVerdict(report: BusinessReport) {
  return report.devices.some((d) => d.verdict === "reproduced") ? "reproduced"
    : report.devices.length && report.devices.every((d) => d.verdict === "not_reproduced") ? "not_reproduced" : "inconclusive";
}

export async function executePlan(page: Page, plan: ReproPlan, device: DeviceName, artifactDir: string, runId: string,
  emit: (step: StepEvidence) => Promise<void>): Promise<StepEvidence[]> {
  const results: StepEvidence[] = [];
  const deadline = Date.now() + 90_000;
  let stopped = false;
  let actionEpoch = 0;
  const requestEpoch = new WeakMap<object, number>();
  const responses: Array<{ response: Response; epoch: number }> = [];
  const onRequest = (request: object) => requestEpoch.set(request, actionEpoch);
  const onResponse = (response: Response) => {
    responses.push({ response, epoch: requestEpoch.get(response.request()) ?? -1 });
    if (responses.length > 100) responses.shift();
  };
  page.on("request", onRequest);
  page.on("response", onResponse);
  const origin = new URL(page.url()).origin;
  try {
    for (const [index, step] of plan.steps.entries()) {
      const result: StepEvidence = { device, index, title: step.title, phase: step.phase, target: step.target,
        status: "blocked", expected: expectedFor(step), actual: "" };
      let target: Locator | undefined;
      let asserting = false;
      const capture = async (suffix: string) => {
        const file = device + "-step-" + index + "-" + suffix + ".png";
        try {
          await page.screenshot({ path: path.join(artifactDir, file), timeout: TIMEOUT, mask: [page.locator('input[type="password"]')] });
          return "/artifacts/" + runId + "/" + file;
        } catch { return undefined; }
      };
      if (stopped) {
        result.status = "skipped"; result.actual = "前置步骤未完成或核心检查失败，未继续执行";
      } else if (Date.now() > deadline) {
        result.actual = "超过单设备 90 秒执行预算"; stopped = true;
      } else {
        try {
          if (new URL(page.url()).origin !== origin) throw new Error("页面已离开已授权站点，停止执行");
          result.beforeUrl = await capture("before");
          if (step.target) {
            target = locate(page, step.target);
            // Re-resolve after every navigation; never choose the first ambiguous match.
            if (step.assertion === "hidden") {
              if (await target.count() > 1) throw new Error("目标匹配多个控件，请缩小定位范围");
            } else {
              await expect(target).toHaveCount(1, { timeout: TIMEOUT });
              await expect(target).toBeVisible({ timeout: TIMEOUT });
              if (await target.getAttribute("type") === "password") throw new Error("v0.5 暂不采集或填写密码，请使用免密测试环境");
            }
          }
          if (step.action === "click") {
            const isSubmit = await target!.evaluate((el) => el instanceof HTMLInputElement ? ["submit", "image"].includes(el.type) : el instanceof HTMLButtonElement && el.type === "submit" && Boolean(el.form));
            const label = ((await target!.textContent()) ?? "") + " " + step.title;
            if ((isSubmit || /删除|支付|购买|发送|验证码|提交|下单|delete|pay|purchase|send|submit/i.test(label)) && !step.allowSideEffect)
              throw new Error("此步骤可能修改业务数据，请在测试环境中明确授权后执行");
            actionEpoch++;
            await target!.click({ timeout: TIMEOUT });
            // Wait for any navigation initiated by the click, then re-observe on next step.
            await page.waitForLoadState("domcontentloaded", { timeout: TIMEOUT });
          } else if (step.action === "reload") {
            actionEpoch++;
            await page.reload({ waitUntil: "domcontentloaded", timeout: 10_000 });
          } else if (step.action === "input") {
            actionEpoch++;
            const supported = await target!.evaluate((el) => el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement && ["text", "tel", "email", "search", "url", "number"].includes(el.type));
            if (!supported) throw new Error("当前键盘输入检查仅支持普通 input / textarea，不支持富文本、密码和特殊日期控件");
            asserting = true;
            await expect(target!).toBeEnabled({ timeout: TIMEOUT });
            await expect(target!).toBeEditable({ timeout: TIMEOUT });
            asserting = false; // Locator/overlay/focus errors alone cannot prove the reported bug.
            await target!.click({ timeout: TIMEOUT });
            await expect(target!).toBeFocused({ timeout: TIMEOUT });
            await target!.press("ControlOrMeta+A");
            await target!.press("Backspace");
            await target!.pressSequentially(step.value ?? "", { delay: 30, timeout: TIMEOUT });
            asserting = true;
            await expect(target!).toHaveValue(step.value ?? "", { timeout: TIMEOUT });
            asserting = false;
            await target!.press("Tab", { timeout: TIMEOUT });
            await page.waitForTimeout(350);
            asserting = true;
            await expect(target!).toHaveValue(step.value ?? "", { timeout: TIMEOUT });
          } else if (step.action === "assert") {
            if (step.assertion === "response") {
              // Only same-origin responses initiated by the last confirmed action are eligible.
              const matches = () => responses.filter(({ response, epoch }) => {
                const url = new URL(response.url());
                return epoch === actionEpoch && actionEpoch > 0 && url.origin === origin && url.pathname === step.requestPath && response.request().method() === step.method;
              });
              await expect.poll(() => matches().length, { timeout: TIMEOUT }).toBe(1);
              const response = matches()[0].response;
              asserting = true;
              result.actual = "HTTP " + response.status();
              expect(response.status()).toBe(step.statusCode);
              if (step.responseField) {
                asserting = false;
                const length = Number(response.headers()["content-length"]);
                if (!length || length > 65536) { asserting = false; throw new Error("响应字段采集仅支持声明长度不超过 64KB 的 JSON 响应"); }
                const json = await response.json();
                const value = step.responseField.split(".").reduce((item, key) => item?.[key], json);
                result.actual += "; " + step.responseField + "=" + String(value).slice(0, 200);
                asserting = true;
                expect(String(value)).toBe(step.value);
              }
            } else {
              asserting = true;
              switch (step.assertion) {
                case "value": await expect(target!).toHaveValue(step.value ?? "", { timeout: TIMEOUT }); break;
                case "text": await expect(target!).toHaveText(step.value ?? "", { timeout: TIMEOUT }); break;
                case "visible": await expect(target!).toBeVisible({ timeout: TIMEOUT }); break;
                case "hidden": await expect(target!).toBeHidden({ timeout: TIMEOUT }); break;
                case "enabled": await expect(target!).toBeEnabled({ timeout: TIMEOUT }); break;
                case "editable": await expect(target!).toBeEditable({ timeout: TIMEOUT }); break;
                case "url": await expect.poll(() => page.url(), { timeout: TIMEOUT }).toBe(new URL(step.value!, page.url()).href); break;
                default: throw new Error("不支持的检查类型");
              }
            }
          }
          result.status = "passed";
          result.actual ||= step.assertion === "hidden" ? "目标已隐藏或消失" : await observe(page, target);
        } catch (error) {
          const assertionFailure = Boolean(error && typeof error === "object" && "matcherResult" in error);
          result.status = asserting && assertionFailure && step.phase === "check" ? "failed" : "blocked";
          result.actual ||= await observe(page, target).catch(() => "目标当前不可读取");
          result.detail = clean(error instanceof Error ? error.message : String(error));
          stopped = true;
        }
        result.afterUrl = await capture("after");
      }
      results.push(result);
      await emit(result);
    }
  } finally {
    page.off("request", onRequest);
    page.off("response", onResponse);
  }
  return results;
}
