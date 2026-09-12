import { describe, expect, it } from "vitest";
import { evalCases, selectCases } from "../src/evaluation/cases.js";
import { summarize, type CaseResult } from "../src/evaluation/report.js";
import { classifyReplay } from "../src/evaluation/runner.js";
import { reproPlanSchema } from "../src/repro-plan.js";
import { generateBusinessTest } from "../src/business-test.js";

describe("evaluation dataset", () => {
  it("has 20 unique valid cases and four smoke cases", () => {
    expect(evalCases).toHaveLength(20);
    expect(new Set(evalCases.map(c => c.id)).size).toBe(20);
    expect(selectCases("smoke").map(c => c.id)).toEqual(["blur-bug", "blur-fixed", "ambiguous-bug", "danger-bug"]);
    for (const item of evalCases) expect(reproPlanSchema.safeParse(item.plan).success, item.id).toBe(true);
  });
  it("keeps exactly the same plan for both fixture versions", () => {
    for (const item of evalCases.filter(c => !c.fixed)) {
      expect(evalCases.find(c => c.fixture === item.fixture && c.fixed)!.plan).toEqual(item.plan);
      expect(item.plan.steps.every(s => !s.allowSideEffect)).toBe(true);
    }
  });
  it("exports a regression test with an optional target override and blur assertion", () => {
    const plan = evalCases[0].plan;
    const input = { url: "http://127.0.0.1/demo", issue: plan.objective, expected: plan.scope, devices: ["desktop" as const], plan, planConfirmed: true };
    expect(generateBusinessTest(input)).not.toContain("process.env.REPROLENS_TARGET_URL");
    const code = generateBusinessTest(input, true);
    expect(code).toContain("process.env.REPROLENS_TARGET_URL");
    expect(code).toContain('.press("Tab")');
    expect(code.match(/toHaveValue/g)).toHaveLength(2);
  });
});

describe("honest evaluation metrics", () => {
  const row = (expected: CaseResult["expected"], actual: CaseResult["actual"]): CaseResult => ({ id: "case", title: "case", expected, actual, passed: expected === actual, durationMs: 100, steps: [] });
  it("uses healthy cases as the false-positive denominator and includes errors in accuracy", () => {
    const metrics = summarize([row("not_reproduced", "reproduced"), row("not_reproduced", "not_reproduced"), row("reproduced", "error"), row("inconclusive", "inconclusive")]);
    expect(metrics.verdictAccuracy).toBe(.5);
    expect(metrics.falsePositiveRate).toBe(.5);
    expect(metrics.errors).toBe(1);
    expect(metrics.inconclusiveRate).toBe(.25);
    expect(metrics.cost).toBeNull();
  });
  it("does not report empty samples as 100%", () => {
    expect(summarize([]).verdictAccuracy).toBeNull();
    expect(summarize([row("reproduced", "reproduced")]).falsePositiveRate).toBeNull();
  });
});

describe("generated test replay grading", () => {
  const result = (status: string, message = "", line = 41) => ({ suites: [{ specs: [{ tests: [{ results: [{ status, error: { message, location: { line } } }] }] }] }] });
  it("accepts expected assertion failure, but not crashes, navigation failures or missing tests", () => {
    const failure = 'toHaveValue(expected) failed\nExpected: "repro-test"\nReceived: ""';
    expect(classifyReplay(result("failed", failure), 1, false, 41).passed).toBe(true);
    expect(classifyReplay(result("failed", failure, 38), 1, false, 41).passed).toBe(false);
    expect(classifyReplay(result("failed", "browserType.launch failed"), 1, false, 41).passed).toBe(false);
    expect(classifyReplay(result("failed", "page.goto timeout"), 1, false, 41).actual).toBe("error");
    expect(classifyReplay({ suites: [] }, 1, false, 41).actual).toBe("error");
    expect(classifyReplay(result("passed"), null, true, 41).actual).toBe("error");
    expect(classifyReplay(result("passed"), 0, true, 41).passed).toBe(true);
    expect(classifyReplay(result("passed"), 0, false, 41).passed).toBe(false);
  });
});
