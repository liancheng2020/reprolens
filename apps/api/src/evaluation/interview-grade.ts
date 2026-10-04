import type { PlanningTrace } from "../provider.js";
import type { ReproPlan, StepEvidence } from "../types.js";
import type { InterviewCase } from "./interview-cases.js";

export function coversInterviewOracle(item: InterviewCase, plan: ReproPlan, ids: Array<string | null | undefined>): boolean {
  if (plan.steps.length > 6 || ids.length !== plan.steps.length) return false;
  let covered = false, added = false, empty = false;
  for (const [index, step] of plan.steps.entries()) {
    const id = ids[index];
    if (step.action === "reload" || step.assertion === "response" || step.allowSideEffect) return false;
    if (step.action === "input" && !(["blur", "disabled", "readonly"].includes(item.kind) && id === "field")) return false;
    if (step.phase === "setup" && step.assertion === "value" && id === "count" && step.value === "0" && !added) empty = true;
    if (step.action === "click") {
      if (item.kind !== "counter" || id !== "add" || added || !empty) return false;
      added = true;
    }
    if (step.phase === "check") {
      const valid = ["blur", "disabled", "readonly"].includes(item.kind) ? step.action === "input" && id === "field"
        : item.kind === "counter" ? added && step.action === "assert" && id === "count" && step.assertion === "value" && step.value === "1"
        : step.action === "assert" && id === "confirm" && step.assertion === "unobscured";
      if (!valid) return false;
      covered = true;
    }
  }
  return covered;
}

export interface InterviewResult {
  id: string; kind: string; schemaValid: boolean; executable: boolean; oracleCovered: boolean;
  pairedPassed: boolean; durationMs: number; trace?: PlanningTrace; error?: string;
  bug?: { verdict: string; steps: StepEvidence[] }; fixed?: { verdict: string; steps: StepEvidence[] };
}

export function summarizeInterview(rows: InterviewResult[]) {
  const count = (field: "schemaValid" | "executable" | "oracleCovered" | "pairedPassed") => rows.filter(r => r[field]).length;
  const rate = (field: "schemaValid" | "executable" | "oracleCovered" | "pairedPassed") => rows.length ? count(field) / rows.length : null;
  const tokens = (field: "inputTokens" | "outputTokens") => rows.length && rows.every(r => typeof r.trace?.[field] === "number")
    ? rows.reduce((sum, r) => sum + r.trace![field]!, 0) : null;
  return { total: rows.length, schemaValidRate: rate("schemaValid"), oracleCoveredRate: rate("oracleCovered"),
    executableRate: rate("executable"), pairedPassed: count("pairedPassed"), pairedPassRate: rate("pairedPassed"),
    averageMs: rows.length ? Math.round(rows.reduce((sum, r) => sum + r.durationMs, 0) / rows.length) : null,
    inputTokens: tokens("inputTokens"), outputTokens: tokens("outputTokens"), cost: null };
}
