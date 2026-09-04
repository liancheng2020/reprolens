import { describe, expect, it } from "vitest";
import { buildVerification } from "../src/verification.js";
import type { Finding, ReproRun, VisualComparison } from "../src/types.js";

function finding(title: string): Finding {
  return {
    id: title,
    title,
    category: "visual",
    severity: "medium",
    description: title,
    evidence: title,
    recommendation: title,
    device: "desktop"
  };
}

function run(id: string, score: number, findings: Finding[]): ReproRun {
  return {
    id,
    createdAt: "2026-09-04T00:00:00.000Z",
    completedAt: "2026-09-04T00:00:01.000Z",
    status: "completed",
    currentStep: "完成",
    input: { url: "http://example.com", issue: "页面布局异常", expected: "页面正常展示", devices: ["desktop"] },
    provider: "deterministic",
    score,
    timeline: [],
    findings,
    screenshots: [],
    metrics: { durationMs: 1000, consoleErrors: 0, networkErrors: 0, accessibilityIssues: 0, testedDevices: 1 }
  };
}

const visualChange: VisualComparison = {
  id: "diff",
  device: "desktop",
  baselineUrl: "/before.png",
  currentUrl: "/after.png",
  diffUrl: "/diff.png",
  width: 100,
  height: 100,
  mismatchPixels: 100,
  mismatchRatio: 0.01
};

describe("fix verification", () => {
  it("marks a run improved when findings are resolved", () => {
    const result = buildVerification(run("before", 82, [finding("横向溢出")]), run("after", 100, []), [visualChange]);
    expect(result.status).toBe("improved");
    expect(result.resolvedFindings).toBe(1);
    expect(result.scoreDelta).toBe(18);
  });

  it("marks a run regressed when new findings appear", () => {
    const result = buildVerification(run("before", 100, []), run("after", 82, [finding("横向溢出")]), [visualChange]);
    expect(result.status).toBe("regressed");
    expect(result.introducedFindings).toBe(1);
  });

  it("separates visual changes from unchanged pages", () => {
    const before = run("before", 100, []);
    const after = run("after", 100, []);
    expect(buildVerification(before, after, [visualChange]).status).toBe("changed");
    expect(buildVerification(before, after, [{ ...visualChange, mismatchPixels: 0, mismatchRatio: 0 }]).status).toBe("unchanged");
  });
});
