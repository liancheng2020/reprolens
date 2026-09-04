import OpenAI from "openai";
import { config } from "./config.js";
import type { AgentAction, CreateRunInput, Finding, InteractiveElement } from "./types.js";

interface PlanResult {
  actions: AgentAction[];
  provider: "deepseek" | "deterministic";
}

interface AnalysisResult {
  summary: string;
  generatedTest: string;
  provider: "deepseek" | "deterministic";
}

function parseJson<T>(content: string): T {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned) as T;
}

function fallbackActions(input: CreateRunInput, elements: InteractiveElement[]): AgentAction[] {
  const text = `${input.issue} ${input.expected}`.toLowerCase();
  const actions: AgentAction[] = [];
  const find = (...keywords: string[]) => elements.find((element) => {
    const haystack = `${element.text} ${element.label} ${element.placeholder} ${element.type}`.toLowerCase();
    return keywords.some((keyword) => haystack.includes(keyword));
  });

  if (/登录|login|sign in/.test(text)) {
    const account = find("邮箱", "用户名", "email", "user");
    const password = find("密码", "password");
    const submit = find("登录", "login", "sign in", "submit");
    if (account) actions.push({ type: "fill", targetId: account.id, value: "demo@example.com", reason: "填写测试账号" });
    if (password) actions.push({ type: "fill", targetId: password.id, value: "wrong-password", reason: "填写错误密码以触发异常路径" });
    if (submit) actions.push({ type: "click", targetId: submit.id, reason: "提交登录表单" });
  } else if (/购物车|cart|加入/.test(text)) {
    const cart = find("加入购物车", "add to cart", "购物车", "cart");
    if (cart) actions.push({ type: "click", targetId: cart.id, reason: "执行问题描述中的加入购物车操作" });
  } else {
    const button = elements.find((element) => element.tag === "button");
    if (button) actions.push({ type: "click", targetId: button.id, reason: "探索页面主要操作" });
  }

  actions.push({ type: "wait", value: "700", reason: "等待界面和网络请求稳定" });
  return actions.slice(0, 5);
}

function fallbackTest(input: CreateRunInput, actions: AgentAction[], elements: InteractiveElement[], findings: Finding[]): string {
  const lines = [
    'import { test, expect } from "@playwright/test";',
    "",
    `test(${JSON.stringify(input.issue.slice(0, 72) || "reproduces reported behavior")}, async ({ page }) => {`,
    "  await page.setViewportSize({ width: 390, height: 844 });",
    `  await page.goto(${JSON.stringify(input.url)});`
  ];

  const networkFinding = findings.find((finding) => finding.category === 'network');
  const consoleFinding = findings.find((finding) => finding.category === 'console');
  const visualFinding = findings.find((finding) => finding.category === 'visual');
  const failedUrl = networkFinding?.description.replace(/^\d+\s+/, '') ?? '';
  let networkPath = '';
  try {
    networkPath = new URL(failedUrl).pathname;
  } catch {
    networkPath = '';
  }
  if (consoleFinding) {
    lines.push(`  const consoleErrors: string[] = [];`);
    lines.push(`  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });`);
  }
  if (networkPath) {
    lines.push(`  const criticalResponse = page.waitForResponse((response) => response.url().includes(${JSON.stringify(networkPath)}));`);
  }

  for (const action of actions) {
    const element = elements.find((item) => item.id === action.targetId);
    if (action.type === "fill" && element) {
      const locator = element.label || element.placeholder || element.text;
      lines.push(`  await page.getByLabel(${JSON.stringify(locator)}).fill(${JSON.stringify(action.value ?? "")});`);
    }
    if (action.type === "click" && element) {
      const name = element.text || element.label;
      if (!name || name.trim().length < 2) continue;
      lines.push(`  await page.getByRole("button", { name: ${JSON.stringify(name)} }).click();`);
    }
  }

  if (networkPath) lines.push(`  expect((await criticalResponse).ok()).toBeTruthy();`);
  if (visualFinding) lines.push(`  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();`);
  if (consoleFinding) lines.push(`  expect(consoleErrors).toEqual([]);`);

  lines.push(`  // Expected: ${input.expected.replace(/\r?\n/g, " ").slice(0, 180)}`);
  lines.push("  await expect(page.locator(\"body\")).toBeVisible();");
  lines.push("});");
  return lines.join("\n");
}

export class DeepSeekProvider {
  private readonly client?: OpenAI;

  constructor() {
    if (config.deepseekApiKey) {
      this.client = new OpenAI({
        apiKey: config.deepseekApiKey,
        baseURL: config.deepseekBaseUrl
      });
    }
  }

  get configured(): boolean {
    return Boolean(this.client);
  }

  async planActions(input: CreateRunInput, elements: InteractiveElement[]): Promise<PlanResult> {
    const fallback = fallbackActions(input, elements);
    if (!this.client) return { actions: fallback, provider: "deterministic" };

    try {
      const response = await this.client.chat.completions.create({
        model: config.deepseekModel,
        messages: [
          {
            role: "system",
            content: [
              "You are a browser QA planning agent.",
              "Return JSON only: {\"actions\":[{\"type\":\"click|fill|wait\",\"targetId\":\"element id\",\"value\":\"optional\",\"reason\":\"Chinese explanation\"}] }.",
              "Use only the supplied element ids. Never invent selectors. Use at most 5 actions.",
              "For wait, omit targetId and use milliseconds in value. Do not navigate away or submit sensitive data."
            ].join(" ")
          },
          {
            role: "user",
            content: JSON.stringify({ bug: input.issue, expected: input.expected, elements: elements.slice(0, 40) })
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 900,
        // @ts-expect-error DeepSeek extension is not declared by the generic OpenAI-compatible SDK.
        thinking: { type: "disabled" }
      });

      const parsed = parseJson<{ actions?: AgentAction[] }>(response.choices[0]?.message?.content ?? "{}");
      const allowedIds = new Set(elements.map((item) => item.id));
      const safe = (parsed.actions ?? []).filter((action) =>
        action.type === "wait" || (Boolean(action.targetId) && allowedIds.has(action.targetId!))
      ).slice(0, 5);
      return { actions: safe.length ? safe : fallback, provider: "deepseek" };
    } catch {
      return { actions: fallback, provider: "deterministic" };
    }
  }

  async analyze(
    input: CreateRunInput,
    findings: Finding[],
    actions: AgentAction[],
    elements: InteractiveElement[]
  ): Promise<AnalysisResult> {
    const fallback = {
      summary: findings.length
        ? `已在 ${new Set(findings.map((item) => item.device)).size} 个测试环境中发现 ${findings.length} 个可验证问题。优先处理运行时错误和失败请求，再修复响应式布局与可访问性问题。`
        : "当前测试路径未发现可验证问题。建议补充更具体的操作步骤和断言后重新运行。",
      generatedTest: fallbackTest(input, actions, elements, findings),
      provider: "deterministic" as const
    };
    if (!this.client) return fallback;

    try {
      const response = await this.client.chat.completions.create({
        model: config.deepseekModel,
        messages: [
          {
            role: "system",
            content: [
              "You are ReproLens, a senior frontend QA engineer.",
              "Based only on supplied evidence, return valid JSON with summary and generatedTest.",
              "summary must be concise Chinese and explain whether evidence supports the bug.",
              "generatedTest must be a complete Playwright TypeScript test without markdown fences.",
              "Never claim source-code root causes that the evidence does not prove."
            ].join(" ")
          },
          {
            role: "user",
            content: JSON.stringify({ input, actions, findings })
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 1800,
        // @ts-expect-error DeepSeek extension is not declared by the generic OpenAI-compatible SDK.
        thinking: { type: "disabled" }
      });

      const parsed = parseJson<{ summary?: string; generatedTest?: string }>(response.choices[0]?.message?.content ?? "{}");
      if (!parsed.summary || !parsed.generatedTest) return fallback;
      parsed.generatedTest = fallback.generatedTest;
      return { summary: parsed.summary, generatedTest: parsed.generatedTest, provider: "deepseek" };
    } catch {
      return fallback;
    }
  }
}
