import { describe, expect, it } from "vitest";
import { interviewCases, interviewFixture } from "../src/evaluation/interview-cases.js";
import { coversInterviewOracle, summarizeInterview, type InterviewResult } from "../src/evaluation/interview-grade.js";
import { demoScenarios } from "../src/demo-scenarios.js";

describe("bounded model acceptance dataset", () => {
  it("has ten synthetic cases covering input, state and mobile obstruction", () => {
    expect(interviewCases).toHaveLength(10);
    expect(new Set(interviewCases.map(c => c.id)).size).toBe(10);
    expect(interviewCases.filter(c => c.device === "iphone13")).toHaveLength(2);
    for (const item of interviewCases) {
      expect(interviewFixture(item, false)).toContain(item.heading);
      expect(interviewFixture(item, true)).toContain(item.heading);
      expect(interviewFixture(item, false)).not.toEqual(interviewFixture(item, true));
    }
  });
  it("includes failed calls in every denominator and never invents usage", () => {
    const valid: InterviewResult = { id: "a", kind: "blur", schemaValid: true, executable: true, oracleCovered: true, pairedPassed: true,
      durationMs: 200, trace: { model: "test", promptVersion: "test", status: "model", durationMs: 100, inputTokens: 20, outputTokens: 30 } };
    const failed: InterviewResult = { ...valid, id: "b", schemaValid: false, executable: false, oracleCovered: false, pairedPassed: false, trace: undefined };
    expect(summarizeInterview([valid, failed])).toMatchObject({ total: 2, pairedPassRate: .5, schemaValidRate: .5, inputTokens: null, cost: null });
    expect(summarizeInterview([valid]).outputTokens).toBe(30);
    expect(summarizeInterview([]).pairedPassRate).toBeNull();
  });
  it("rejects weaker or unrelated core assertions rather than grading any failure as success", () => {
    const plan = structuredClone(demoScenarios[2]!.plan!);
    expect(coversInterviewOracle(interviewCases[0]!, plan, [null, "field"])).toBe(true);
    plan.steps[1]!.action = "assert"; plan.steps[1]!.assertion = "visible";
    expect(coversInterviewOracle(interviewCases[0]!, plan, [null, "field"])).toBe(false);
    const extra = structuredClone(demoScenarios[2]!.plan!);
    extra.steps.push({ title: "无关检查", action: "assert", phase: "check", assertion: "text", target: { by: "css", value: "#other" }, value: "wrong", allowSideEffect: false });
    expect(coversInterviewOracle(interviewCases[0]!, extra, [null, "field", "other"])).toBe(false);
  });
});
