import { describe, expect, it } from "vitest";
import { planningForRun } from "../src/planning.js";
import { demoScenarios } from "../src/demo-scenarios.js";
import { reproPlanSchema } from "../src/repro-plan.js";
import type { CreateRunInput, PlanningRecord } from "../src/types.js";

const demo = demoScenarios[2]!;
const input: CreateRunInput = { ...demo, url: "http://127.0.0.1/demo/profile?fixed=0", plan: reproPlanSchema.parse(demo.plan), planConfirmed: true };
const stored: PlanningRecord = { id: "planning", createdAt: "2026-10-04", source: "model", candidate: input.plan,
  request: { url: input.url, issue: input.issue, expected: input.expected },
  trace: { model: "test-model", promptVersion: "test-prompt", status: "model", durationMs: 20, inputTokens: 30, outputTokens: 10 } };

describe("planning provenance", () => {
  it("records fixed demos and manual plans without claiming model usage", () => {
    expect(planningForRun({ ...input, demoId: demo.id }).source).toBe("demo");
    expect(planningForRun(input).source).toBe("manual");
  });
  it("preserves the candidate, trace and final-plan edit status", () => {
    const plan = structuredClone(input.plan!);
    plan.steps[1]!.value = "different";
    const record = planningForRun({ ...input, planningId: "planning", plan }, stored);
    expect(record.edited).toBe(true);
    expect(record.candidate?.steps[1]?.value).toBe("repro-test");
    expect(record.trace?.model).toBe("test-model");
    expect(record.confirmedAt).toBeTruthy();
  });
  it("rejects missing records and records from another request", () => {
    expect(() => planningForRun({ ...input, planningId: "missing" })).toThrow();
    expect(() => planningForRun({ ...input, planningId: "planning", expected: "changed" }, stored)).toThrow();
  });
  it("keeps a fallback template distinct from successful model planning", () => {
    const record = planningForRun({ ...input, planningId: "planning" }, { ...stored, source: "template", trace: { ...stored.trace!, status: "fallback", errorCode: "INVALID_JSON" } });
    expect(record.source).toBe("template");
    expect(record.trace?.errorCode).toBe("INVALID_JSON");
  });
  it("rejects false fixed-demo provenance for another problem or page", () => {
    expect(() => planningForRun({ ...input, demoId: demo.id, url: "http://localhost/other" })).toThrow();
    expect(() => planningForRun({ ...input, demoId: demo.id, issue: "different problem" })).toThrow();
  });
});
