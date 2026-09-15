import { isDeepStrictEqual } from "node:util";
import type { BusinessVerification, ReproRun } from "./types.js";

export function verifyBusiness(baseline: ReproRun, current: ReproRun): BusinessVerification {
  const result: BusinessVerification = {
    version: 1, status: "not_comparable", comparable: false,
    summary: "检查标准改变或缺少已确认计划，不能按同一标准验证修复。",
    originalFailures: 0, resolvedFailures: 0, otherFailures: 0, steps: []
  };
  const plan = baseline.input.plan;
  if (!plan || !current.input.plan || !baseline.input.planConfirmed || !current.input.planConfirmed ||
      !isDeepStrictEqual(plan, current.input.plan) ||
      !isDeepStrictEqual([...baseline.input.devices].sort(), [...current.input.devices].sort()) ||
      baseline.input.issue !== current.input.issue || baseline.input.expected !== current.input.expected) return result;
  result.comparable = true;
  result.steps = baseline.input.devices.flatMap(device => plan.steps.map((step, index) => ({
    device, index, title: step.title, phase: step.phase,
    baseline: baseline.business?.steps.find(item => item.device === device && item.index === index),
    current: current.business?.steps.find(item => item.device === device && item.index === index)
  })));
  // Reject duplicate, out-of-plan and phase-mismatched evidence instead of trusting cached coverage.
  const valid = (run: ReproRun) => {
    const evidence = run.business?.steps;
    return !!evidence && new Set(evidence.map(s => s.device + ":" + s.index)).size === evidence.length &&
      evidence.every(s => run.input.devices.includes(s.device) && plan.steps[s.index]?.phase === s.phase);
  };
  const checks = result.steps.filter(step => step.phase === "check");
  const original = checks.filter(step => step.baseline?.status === "failed");
  result.originalFailures = original.length;
  result.resolvedFailures = original.filter(step => step.current?.status === "passed").length;
  result.otherFailures = checks.filter(step => step.current?.status === "failed" && step.baseline?.status !== "failed").length;
  if (!valid(baseline) || !valid(current) || !checks.length || baseline.status !== "completed" || current.status !== "completed") {
    result.status = "inconclusive";
    result.summary = "执行未完成或证据缺失/不一致，不能确认修复。";
  } else if (original.some(step => step.current?.status === "failed")) {
    result.status = "still_reproduced";
    result.summary = "原失败检查仍未通过，目标问题仍可复现。";
  } else if (result.otherFailures) {
    result.status = "regressed";
    result.summary = "其他核心检查失败，不能判定整体修复通过；需核查是否为新增回归。";
  } else if (result.steps.some(step => step.current?.status !== "passed")) {
    result.status = "inconclusive";
    result.summary = "存在受阻、跳过或缺失步骤，不能确认修复。";
  } else if (!original.length) {
    result.status = "no_baseline_failure";
    result.summary = "基线没有已复现的核心失败，本次路径通过，但不能据此证明修复。";
  } else {
    result.status = "fixed";
    result.summary = "原失败检查全部通过，其余步骤完整通过：在本次计划与设备范围内，修复验证通过。";
  }
  return result;
}
