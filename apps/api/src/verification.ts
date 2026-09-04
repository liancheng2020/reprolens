import type { Finding, ReproRun, VerificationResult, VerificationStatus, VisualComparison } from "./types.js";

function findingKeys(findings: Finding[]): Set<string> {
  return new Set(findings.map((finding) => `${finding.category}:${finding.title}`));
}

function difference(left: Set<string>, right: Set<string>): number {
  return [...left].filter((key) => !right.has(key)).length;
}

function verificationStatus(
  scoreDelta: number,
  resolvedFindings: number,
  introducedFindings: number,
  comparisons: VisualComparison[]
): VerificationStatus {
  if (scoreDelta > 0 || resolvedFindings > introducedFindings) return "improved";
  if (scoreDelta < 0 || introducedFindings > resolvedFindings) return "regressed";
  return comparisons.some((comparison) => comparison.mismatchRatio >= 0.001) ? "changed" : "unchanged";
}

function summaryFor(status: VerificationStatus, resolved: number, introduced: number, scoreDelta: number): string {
  const score = scoreDelta === 0 ? "评分不变" : `评分${scoreDelta > 0 ? "提升" : "下降"} ${Math.abs(scoreDelta)} 分`;
  const detail = `解决 ${resolved} 类问题，引入 ${introduced} 类问题，${score}。`;
  const lead: Record<VerificationStatus, string> = {
    improved: "修复验证通过，当前版本的可验证问题有所减少。",
    regressed: "修复验证发现回归，当前版本出现了更多问题。",
    changed: "页面视觉发生变化，但质量指标没有明确改善。",
    unchanged: "页面与基线基本一致，暂未观察到有效修复。"
  };
  return `${lead[status]}${detail}`;
}

export function buildVerification(
  baseline: ReproRun,
  current: ReproRun,
  comparisons: VisualComparison[]
): VerificationResult {
  const baselineFindings = findingKeys(baseline.findings);
  const currentFindings = findingKeys(current.findings);
  const resolvedFindings = difference(baselineFindings, currentFindings);
  const introducedFindings = difference(currentFindings, baselineFindings);
  const scoreDelta = (current.score ?? 0) - (baseline.score ?? 0);
  const status = verificationStatus(scoreDelta, resolvedFindings, introducedFindings, comparisons);

  return {
    baselineRunId: baseline.id,
    status,
    scoreDelta,
    resolvedFindings,
    introducedFindings,
    summary: summaryFor(status, resolvedFindings, introducedFindings, scoreDelta),
    comparisons
  };
}
