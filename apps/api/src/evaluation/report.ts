import type { StepEvidence } from "../types.js";
import type { Verdict } from "./cases.js";

export interface CaseResult {
  id: string; title: string; expected: Verdict; actual: Verdict | "error";
  passed: boolean; durationMs: number; steps: StepEvidence[]; error?: string;
}
export interface ReplayResult {
  fixed: boolean; expected: "passed" | "failed"; actual: "passed" | "failed" | "error";
  passed: boolean; error?: string;
}
export interface EvalReport {
  id: string; version: 1; datasetVersion: "1"; suite: "smoke" | "full";
  mode: "deterministic-executor"; status: "running" | "completed" | "failed";
  startedAt: string; finishedAt?: string; total: number;
  results: CaseResult[]; replay: ReplayResult[]; error?: string; passed?: boolean;
  metrics?: ReturnType<typeof summarize>;
  artifactsUrl: string;
}

export function summarize(results: CaseResult[]) {
  const negatives = results.filter(r => r.expected === "not_reproduced");
  const rate = (n: number, d: number) => d ? n / d : null;
  return {
    casePassRate: rate(results.filter(r => r.passed).length, results.length),
    verdictAccuracy: rate(results.filter(r => r.actual === r.expected).length, results.length),
    falsePositiveRate: rate(negatives.filter(r => r.actual === "reproduced").length, negatives.length),
    inconclusiveRate: rate(results.filter(r => r.actual === "inconclusive").length, results.length),
    errors: results.filter(r => r.actual === "error").length,
    averageDurationMs: results.length ? Math.round(results.reduce((sum, r) => sum + r.durationMs, 0) / results.length) : null,
    modelCalls: 0, tokenUsage: null, cost: null
  };
}
