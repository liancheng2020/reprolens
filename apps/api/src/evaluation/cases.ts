import type { ReproPlan, ReproStep } from "../types.js";

export const verdicts = ["reproduced", "not_reproduced", "inconclusive"] as const;
export type Verdict = typeof verdicts[number];
export type Fixture = "blur" | "disabled" | "readonly" | "missing" | "text" | "hidden" | "delayed" | "ambiguous" | "danger" | "setup";
export interface EvalCase {
  id: string;
  title: string;
  fixture: Fixture;
  fixed: boolean;
  expected: Verdict;
  expectedStatus: "passed" | "failed" | "blocked";
  smoke: boolean;
  plan: ReproPlan;
}

const target = { by: "label" as const, value: "显示名称" };
const input: ReproStep = { title: "输入后失焦仍保留测试值", action: "input", phase: "check", target, value: "repro-test", allowSideEffect: false };
const check = (assertion: ReproStep["assertion"], value?: string): ReproStep => ({
  title: "核对业务结果", action: "assert", phase: "check", assertion,
  target: { by: "css", value: "#result" }, value, allowSideEffect: false
});

const scenarios: Array<{ fixture: Fixture; title: string; steps: ReproStep[]; blocked?: boolean }> = [
  { fixture: "blur", title: "输入失焦后值丢失", steps: [input] },
  { fixture: "disabled", title: "输入框意外禁用", steps: [input] },
  { fixture: "readonly", title: "输入框意外只读", steps: [input] },
  { fixture: "missing", title: "成功提示未出现", steps: [check("visible")] },
  { fixture: "text", title: "业务文案不正确", steps: [check("text", "保存成功")] },
  { fixture: "hidden", title: "加载遮罩未消失", steps: [check("hidden")] },
  { fixture: "delayed", title: "延迟出现的成功提示", steps: [check("visible")] },
  { fixture: "ambiguous", title: "同名输入框定位歧义", steps: [input], blocked: true },
  { fixture: "danger", title: "未授权的删除动作", steps: [
    { title: "操作测试按钮", action: "click", phase: "setup", target: { by: "css", value: "#action" }, allowSideEffect: false },
    check("text", "保存成功")
  ], blocked: true },
  { fixture: "setup", title: "目标页面前置条件缺失", steps: [input], blocked: true }
];

export const evalCases: EvalCase[] = scenarios.flatMap(({ fixture, title, steps, blocked }) => [false, true].map(fixed => ({
  id: `${fixture}-${fixed ? "fixed" : "bug"}`, title, fixture, fixed,
  expected: fixed ? "not_reproduced" : blocked ? "inconclusive" : "reproduced",
  expectedStatus: fixed ? "passed" : blocked ? "blocked" : "failed",
  smoke: fixture === "blur" || (!fixed && ["ambiguous", "danger"].includes(fixture)),
  plan: {
    version: 1, objective: title, scope: "仅限内置隔离演示页，使用合成数据；保持同一预期断言。", warnings: [],
    steps: [{ title: "确认目标表单场景", action: "assert", phase: "setup", assertion: "visible", target: { by: "text", value: "个人资料" }, allowSideEffect: false }, ...steps]
  }
})));

export function selectCases(suite: "smoke" | "full"): EvalCase[] {
  return suite === "smoke" ? evalCases.filter(item => item.smoke) : evalCases;
}
