import { describe, expect, it } from "vitest";
import { verifyBusiness } from "../src/business-verification.js";
import { checkConclusion } from "../src/github/publisher.js";
import { buildVerification } from "../src/verification.js";
import type { ReproRun } from "../src/types.js";

function run(statuses: Array<"passed" | "failed" | "blocked" | "skipped">): ReproRun {
  const steps = [
    { title: "确认页面", action: "assert" as const, phase: "setup" as const, assertion: "visible" as const, target: { by: "text" as const, value: "资料" }, allowSideEffect: false },
    { title: "值保留", action: "input" as const, phase: "check" as const, target: { by: "label" as const, value: "姓名" }, value: "demo", allowSideEffect: false },
    { title: "结果可见", action: "assert" as const, phase: "check" as const, assertion: "visible" as const, target: { by: "text" as const, value: "成功" }, allowSideEffect: false }
  ];
  return {
    id: "test", createdAt: "", status: "completed", currentStep: "", provider: "deterministic",
    input: { url: "http://localhost/demo", issue: "输入丢失", expected: "保留", devices: ["desktop"], planConfirmed: true,
      plan: { version: 1, objective: "检查", scope: "输入", warnings: [], steps } },
    findings: [], screenshots: [], timeline: [],
    business: { version: 1, steps: statuses.map((status, index) => ({ device: "desktop", index, title: steps[index].title, phase: steps[index].phase, status, expected: "期望", actual: status })),
      devices: [], covered: 2, total: 2, testStatus: "generated" },
    metrics: { durationMs: 0, consoleErrors: 0, networkErrors: 0, accessibilityIssues: 0, testedDevices: 1 }
  };
}

describe("business fix verification", () => {
  const baseline = () => run(["passed", "failed", "skipped"]);
  it("proves a bounded fix from complete passing evidence, not pixels", () => {
    const current = run(["passed", "passed", "passed"]);
    current.input.url = "http://localhost/demo?fixed=1";
    const fix = verifyBusiness(baseline(), current);
    expect(fix.status).toBe("fixed");
    expect(fix.resolvedFailures).toBe(1);
    expect(fix.steps[1].baseline?.actual).toBe("failed");
    expect(fix.steps[1].current?.actual).toBe("passed");
  });
  it("retains the original failure", () => expect(verifyBusiness(baseline(), baseline()).status).toBe("still_reproduced"));
  it("cannot turn higher quality scores into a business fix", () => {
    const before = baseline(), after = baseline(); before.score = 0; after.score = 100;
    const comparison = buildVerification(before, after, []);
    expect(comparison.status).toBe("improved");
    expect(comparison.business?.status).toBe("still_reproduced");
    after.verification = comparison;
    expect(checkConclusion(after)).toBe("failure");
  });
  it("reports other failures without claiming a complete fix", () => expect(verifyBusiness(baseline(), run(["passed", "passed", "failed"])).status).toBe("regressed"));
  for (const states of [["blocked", "skipped", "skipped"], ["passed", "passed"], ["passed", "passed", "skipped"]] as const) {
    it("does not trust cached coverage when steps are blocked, missing or skipped: " + states.join(","), () => {
      expect(verifyBusiness(baseline(), run([...states])).status).toBe("inconclusive");
    });
  }
  it("rejects failed execution even with passing cached steps", () => {
    const current = run(["passed", "passed", "passed"]); current.status = "failed";
    expect(verifyBusiness(baseline(), current).status).toBe("inconclusive");
  });
  it("does not prove a fix without a baseline failure", () => {
    const current = run(["passed", "passed", "passed"]);
    expect(verifyBusiness(current, current).status).toBe("no_baseline_failure");
  });
  for (const change of ["plan", "devices", "expected", "confirmation"] as const) {
    it("rejects changed " + change, () => {
      const current = run(["passed", "passed", "passed"]);
      if (change === "plan") current.input.plan!.steps[1].value = "different";
      if (change === "devices") current.input.devices = ["iphone13"];
      if (change === "expected") current.input.expected = "new";
      if (change === "confirmation") current.input.planConfirmed = false;
      expect(verifyBusiness(baseline(), current).status).toBe("not_comparable");
    });
  }
  it("handles legacy records conservatively", () => {
    const before = baseline(); before.business = undefined;
    expect(verifyBusiness(before, run(["passed", "passed", "passed"])).status).toBe("inconclusive");
  });
  it("rejects duplicated evidence", () => {
    const current = run(["passed", "passed", "passed"]); current.business!.steps.push(current.business!.steps[1]);
    expect(verifyBusiness(baseline(), current).status).toBe("inconclusive");
  });
  it("requires all configured devices to execute", () => {
    const before = baseline(), current = run(["passed", "passed", "passed"]);
    before.input.devices.push("iphone13"); current.input.devices.push("iphone13");
    expect(verifyBusiness(before, current).status).toBe("inconclusive");
  });
  it("publishes neutral instead of success for incomparable verification", () => {
    const current = run(["passed", "passed", "passed"]); current.input.expected = "changed"; current.verdict = "not_reproduced";
    current.verification = buildVerification(baseline(), current, []);
    expect(checkConclusion(current)).toBe("neutral");
  });
});
