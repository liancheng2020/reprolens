import { describe, expect, it } from "vitest";
import { buildGitHubReport, checkConclusion, REPORT_MARKER } from "../src/github/publisher.js";
import type { ReproRun } from "../src/types.js";

function run(overrides: Partial<ReproRun> = {}): ReproRun {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    createdAt: "2026-09-04T00:00:00.000Z",
    completedAt: "2026-09-04T00:00:01.000Z",
    status: "completed",
    currentStep: "完成",
    input: {
      url: "https://example.com",
      issue: "按钮点击无效",
      expected: "按钮应响应",
      devices: ["desktop"]
    },
    provider: "deterministic",
    score: 62,
    verdict: "reproduced",
    confidence: 91,
    summary: "问题可稳定复现。",
    timeline: [],
    findings: [],
    screenshots: [],
    generatedTest: "test('repro', async () => {});",
    metrics: {
      durationMs: 1000,
      consoleErrors: 0,
      networkErrors: 1,
      accessibilityIssues: 0,
      testedDevices: 1
    },
    ...overrides
  };
}

describe("GitHub report publisher", () => {
  it("creates an upsertable evidence report", () => {
    const report = buildGitHubReport(run());
    expect(report).toContain(REPORT_MARKER);
    expect(report).toContain("已复现");
    expect(report).toContain("Playwright 回归测试：已生成");
  });

  it("maps verification outcomes to check conclusions", () => {
    expect(checkConclusion(run())).toBe("failure");
    expect(checkConclusion(run({ verdict: "not_reproduced" }))).toBe("success");
    expect(checkConclusion(run({ verdict: "inconclusive" }))).toBe("neutral");
    expect(checkConclusion(run({ verdict: "not_reproduced", quality: {
      gate: { status: "failed", reasons: ["评分过低"], thresholds: { enabled: true, minScore: 75, maxHighSeverityFindings: 0, maxAccessibilityIssues: 3, maxPerformanceIssues: 2 } },
      devices: [],
      categoryCounts: { functional: 0, visual: 0, accessibility: 1, performance: 2, console: 0, network: 0 }
    } }))).toBe("failure");
  });
});
