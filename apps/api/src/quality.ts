import { calculateScore } from "./analyzer.js";
import type {
  DeviceQualityMetrics,
  Finding,
  FindingCategory,
  QualityGateConfig,
  QualityGateResult,
  QualityReport,
  QualityTrendPoint,
  ReproRun,
  WebVitals
} from "./types.js";

export const defaultQualityGate: QualityGateConfig = {
  enabled: true,
  minScore: 75,
  maxHighSeverityFindings: 0,
  maxAccessibilityIssues: 3,
  maxPerformanceIssues: 2
};

const categories: FindingCategory[] = ["functional", "visual", "accessibility", "performance", "console", "network"];

export function normalizeQualityGate(value?: Partial<QualityGateConfig>): QualityGateConfig {
  return { ...defaultQualityGate, ...value };
}

export function countFindingCategories(findings: Finding[]): Record<FindingCategory, number> {
  return Object.fromEntries(categories.map((category) => [category, findings.filter((item) => item.category === category).length])) as Record<FindingCategory, number>;
}

export function evaluateQualityGate(findings: Finding[], score: number, value?: Partial<QualityGateConfig>): QualityGateResult {
  const thresholds = normalizeQualityGate(value);
  if (!thresholds.enabled) return { status: "disabled", thresholds, reasons: [] };

  const counts = countFindingCategories(findings);
  const highSeverity = findings.filter((item) => item.severity === "high").length;
  const reasons: string[] = [];
  if (score < thresholds.minScore) reasons.push(`质量评分 ${score} 低于阈值 ${thresholds.minScore}`);
  if (highSeverity > thresholds.maxHighSeverityFindings) reasons.push(`高严重度问题 ${highSeverity} 个，超过阈值 ${thresholds.maxHighSeverityFindings}`);
  if (counts.accessibility > thresholds.maxAccessibilityIssues) reasons.push(`可访问性问题 ${counts.accessibility} 个，超过阈值 ${thresholds.maxAccessibilityIssues}`);
  if (counts.performance > thresholds.maxPerformanceIssues) reasons.push(`性能问题 ${counts.performance} 个，超过阈值 ${thresholds.maxPerformanceIssues}`);
  return { status: reasons.length ? "failed" : "passed", thresholds, reasons };
}

export function buildQualityReport(
  findings: Finding[],
  score: number,
  metrics: Array<{ device: DeviceQualityMetrics["device"]; vitals: WebVitals }>,
  gate?: Partial<QualityGateConfig>
): QualityReport {
  return {
    gate: evaluateQualityGate(findings, score, gate),
    devices: metrics.map(({ device, vitals }) => {
      const deviceFindings = findings.filter((item) => item.device === device);
      return {
        device,
        score: calculateScore(deviceFindings),
        accessibilityIssues: deviceFindings.filter((item) => item.category === "accessibility").length,
        performanceIssues: deviceFindings.filter((item) => item.category === "performance").length,
        vitals
      };
    }),
    categoryCounts: countFindingCategories(findings)
  };
}

export function buildQualityTrends(runs: ReproRun[], url?: string): QualityTrendPoint[] {
  return runs
    .filter((run) => run.status === "completed" && run.score !== undefined && (!url || run.input.url === url))
    .slice(0, 30)
    .reverse()
    .map((run) => ({
      runId: run.id,
      createdAt: run.createdAt,
      url: run.input.url,
      score: run.score!,
      gateStatus: run.quality?.gate.status ?? "disabled",
      categories: run.quality?.categoryCounts ?? countFindingCategories(run.findings),
      devices: run.quality?.devices ?? []
    }));
}
