import { describe, expect, it } from "vitest";
import { buildQualityReport, buildQualityTrends, evaluateQualityGate } from "../src/quality.js";
import type { Finding, ReproRun } from "../src/types.js";

function finding(category: Finding["category"], severity: Finding["severity"] = "medium"): Finding {
  return {
    id: `${category}-${severity}`,
    category,
    severity,
    title: `${category} issue`,
    description: "description",
    evidence: "evidence",
    recommendation: "fix it",
    device: "desktop"
  };
}

describe("quality analysis", () => {
  it("fails a gate with explicit threshold reasons", () => {
    const result = evaluateQualityGate([finding("accessibility", "high"), finding("performance")], 70);
    expect(result.status).toBe("failed");
    expect(result.reasons).toEqual(expect.arrayContaining([expect.stringContaining("评分"), expect.stringContaining("高严重度")]));
  });

  it("can disable quality blocking while retaining thresholds", () => {
    expect(evaluateQualityGate([finding("accessibility", "high")], 20, { enabled: false }).status).toBe("disabled");
  });

  it("builds device metrics and chronological trend points", () => {
    const findings = [finding("performance")];
    const quality = buildQualityReport(findings, 92, [{
      device: "desktop",
      vitals: { lcpMs: 1800, cls: 0.03, resourceCount: 10, transferSizeKb: 120 }
    }]);
    expect(quality.devices[0]).toMatchObject({ device: "desktop", score: 92, performanceIssues: 1 });

    const run = {
      id: "run-1",
      createdAt: "2026-09-05T00:00:00.000Z",
      status: "completed",
      input: { url: "https://example.com", issue: "issue", expected: "expected", devices: ["desktop"] },
      score: 92,
      findings,
      quality
    } as ReproRun;
    expect(buildQualityTrends([run])).toEqual([expect.objectContaining({ runId: "run-1", score: 92, devices: quality.devices })]);
    expect(buildQualityTrends([run], "https://other.example.com")).toEqual([]);
  });
});
