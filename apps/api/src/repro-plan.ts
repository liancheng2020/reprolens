import { z } from "zod";
import type { CreateRunInput, ReproPlan } from "./types.js";

const targetSchema = z.object({
  by: z.enum(["label", "placeholder", "text", "role", "css"]),
  value: z.string().trim().min(1).max(300),
  role: z.enum(["button", "link", "tab", "textbox", "checkbox", "heading"]).optional()
}).refine((target) => target.by !== "role" || Boolean(target.role), "角色定位需要填写 role");

export const reproPlanSchema = z.object({
  version: z.literal(1),
  objective: z.string().trim().min(1).max(3000),
  scope: z.string().trim().min(1).max(2000),
  warnings: z.array(z.string().max(500)).max(10),
  steps: z.array(z.object({
    title: z.string().trim().min(1).max(200),
    action: z.enum(["click", "input", "assert", "reload"]),
    phase: z.enum(["setup", "check"]),
    target: targetSchema.optional(),
    value: z.string().max(500).optional(),
    assertion: z.enum(["value", "text", "visible", "hidden", "enabled", "editable", "url", "response", "unobscured"]).optional(),
    requestPath: z.string().startsWith("/").max(300).optional(),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
    statusCode: z.number().int().min(100).max(599).optional(),
    responseField: z.string().regex(/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/).max(100).optional(),
    allowSideEffect: z.boolean()
  }).superRefine((step, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (step.action === "assert" && !step.assertion) fail("请选择检查类型");
    if (step.action !== "reload" && !["url", "response"].includes(step.assertion ?? "") && !step.target) fail("请明确目标控件");
    if ((step.action === "input" || ["value", "text", "url"].includes(step.assertion ?? "")) && step.value === undefined) fail("请填写测试值或期望值");
    if (step.action === "input" && step.assertion && step.assertion !== "value") fail("输入步骤只允许值断言");
    if (["click", "reload"].includes(step.action) && step.assertion) fail("点击和刷新步骤不能携带断言");
    if (step.action === "input" && (!step.value || step.value.length > 100)) fail("键盘测试输入需为 1–100 个字符");
    if (step.action === "assert" && ["url", "response"].includes(step.assertion ?? "") && step.target) fail("URL 和请求断言不应绑定页面控件");
    if (step.assertion === "response" && (!step.requestPath || !step.method || !step.statusCode)) fail("请求检查需要路径、方法和状态码");
    if (step.responseField && step.value === undefined) fail("响应字段检查需要期望值");
    if (step.responseField && /password|token|cookie|secret|authorization/i.test(step.responseField)) fail("不能采集敏感响应字段");
    if (step.phase === "check" && !["input", "assert"].includes(step.action)) fail("核心检查必须为输入验证或断言");
  })).min(1).max(15)
}).superRefine((plan, ctx) => {
  if (!plan.steps.some((step) => step.phase === "check")) ctx.addIssue({ code: "custom", message: "至少需要一个核心业务检查项" });
  const firstCheck = plan.steps.findIndex((step) => step.phase === "check");
  if (!plan.steps.slice(0, firstCheck).some((step) => step.phase === "setup" && step.action === "assert" && ["visible", "url"].includes(step.assertion ?? "")))
    ctx.addIssue({ code: "custom", message: "核心检查之前必须增加目标场景的前置断言（可见标识或 URL）" });
  for (const [index, step] of plan.steps.entries()) {
    if (step.assertion === "response" && !plan.steps.slice(0, index).some((item) => ["click", "input", "reload"].includes(item.action)))
      ctx.addIssue({ code: "custom", message: "请求断言必须放在触发请求的操作之后" });
  }
});

export function draftPlan(input: CreateRunInput): ReproPlan {
  return {
    version: 1,
    objective: input.issue,
    scope: input.expected,
    warnings: ["这是待编辑的安全模板。请填写准确的页面标识、目标控件与期望值；系统不会猜测注册入口或自动提交表单。"],
    steps: [
      { title: "确认已到达目标页面（请编辑页面标识）", action: "assert", phase: "setup", assertion: "visible", target: { by: "text", value: "请填写目标表单标题" }, allowSideEffect: false },
      { title: "验证目标输入框的输入能力（请编辑控件）", action: "input", phase: "check", target: { by: "label", value: "请填写输入框名称" }, value: "repro-test", allowSideEffect: false }
    ]
  };
}

export const planPrompt = [
  "Generate a bounded browser reproduction plan, NOT a page quality scan. Return JSON only.",
  'Schema: {version:1, objective:string, scope:string, warnings:string[], steps:[{title:string,action:"click|input|assert|reload",phase:"setup|check",target?:{by:"label|placeholder|text|role|css",value:string,role?:"button|link|tab|textbox|checkbox|heading"},value?:string,assertion?:"value|text|visible|hidden|enabled|editable|url|response|unobscured",requestPath?:string,method?:"GET|POST|PUT|PATCH|DELETE",statusCode?:number,responseField?:string,allowSideEffect:false}]}',
  "Use Chinese titles and warnings. At most 15 steps. Every reported expectation must be covered or explicitly identified as out of scope in warnings.",
  "You have NOT observed the website. Locators are suggestions for user confirmation. Explicitly warn about unknown targets. Never invent an observed result.",
  "First verify the target scene using a setup assertion. If the report concerns registration but URL is login, suggest opening registration and then verifying its form before typing.",
  "For cannot-type reports use action input with phase check and test value: it tests user keyboard input, retention, and editability. Do not substitute visibility or page quality.",
  "For reported UI obstruction use assertion unobscured: it checks that the entire target bounding rectangle is in the viewport and its center receives pointer hits. It does not prove visual design correctness or full-area visibility. Do not replace a UI-specific expectation with generic quality findings.",
  "Do not submit registration or send SMS just to test typing. All input data must be synthetic. No credentials, payments, deletion, or external messaging.",
  "setup input or click is only preparation; check input or assert decides the bug verdict. Prefer semantic unique locators. No arbitrary JavaScript. Never output an empty plan."
].join("\n");
