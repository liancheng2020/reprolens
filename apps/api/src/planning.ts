import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { demoScenarios } from "./demo-scenarios.js";
import type { CreateRunInput, PlanningRecord } from "./types.js";
import { reproPlanSchema } from "./repro-plan.js";

export function planningForRun(input: CreateRunInput, stored?: PlanningRecord) {
  const request = { url: input.url, issue: input.issue, expected: input.expected };
  if (input.planningId && (!stored || !isDeepStrictEqual(stored.request, request))) {
    throw new Error("规划记录不存在或问题已改变，请重新生成计划");
  }
  const demo = demoScenarios.find(item => item.id === input.demoId);
  if (input.demoId && !demo) throw new Error("内置示例不存在");
  const record: PlanningRecord = stored ?? {
    id: randomUUID(), createdAt: new Date().toISOString(), request,
    source: demo ? "demo" : "manual", demoId: demo?.id,
    candidate: demo?.plan ? reproPlanSchema.parse(demo.plan) : undefined
  };
  return { ...record, edited: Boolean(record.candidate && !isDeepStrictEqual(record.candidate, input.plan)),
    confirmedAt: input.planConfirmed ? new Date().toISOString() : undefined };
}
