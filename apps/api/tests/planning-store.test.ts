import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { config } from "../src/config.js";
import { RunStore } from "../src/store.js";
import type { PlanningRecord } from "../src/types.js";
import type { ReproRun } from "../src/types.js";

it("persists planning records across store instances without listing them as runs", async () => {
  const previous = { dataDir: config.dataDir, artifactsDir: config.artifactsDir };
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "reprolens-plan-store-"));
  config.dataDir = path.join(dir, "runs"); config.artifactsDir = path.join(dir, "artifacts");
  try {
    const store = new RunStore(); await store.init();
    const record: PlanningRecord = { id: randomUUID(), createdAt: new Date().toISOString(), source: "template",
      request: { url: "http://localhost/demo", issue: "example", expected: "example" } };
    await store.savePlan(record);
    expect(await new RunStore().getPlan(record.id)).toEqual(record);
    expect(await store.list()).toEqual([]);
    expect(await store.getPlan("../secret")).toBeUndefined();
  } finally { Object.assign(config, previous); await fs.rm(dir, { recursive: true, force: true }); }
});

it("marks interrupted runs as inconclusive on startup without replaying them", async () => {
  const previous = { dataDir: config.dataDir, artifactsDir: config.artifactsDir };
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "reprolens-recovery-"));
  config.dataDir = path.join(dir, "runs"); config.artifactsDir = path.join(dir, "artifacts");
  try {
    const store = new RunStore(); await store.init();
    const base: ReproRun = { id: randomUUID(), createdAt: new Date().toISOString(), status: "running", currentStep: "执行中",
      input: { url: "http://localhost", issue: "example", expected: "example", devices: ["desktop"] }, provider: "deterministic",
      timeline: [], findings: [], screenshots: [], metrics: { durationMs: 0, consoleErrors: 0, networkErrors: 0, accessibilityIssues: 0, testedDevices: 1 } };
    const completed = { ...base, id: randomUUID(), status: "completed" as const };
    const queued = { ...base, id: randomUUID(), status: "queued" as const };
    await store.save(base); await store.save(completed); await store.save(queued);
    expect(await store.recoverInterrupted()).toBe(2);
    expect(await store.get(base.id)).toMatchObject({ status: "failed", verdict: "inconclusive", currentStep: "执行已中断" });
    expect(await store.get(completed.id)).toEqual(completed);
    expect(await store.recoverInterrupted()).toBe(0);
  } finally { Object.assign(config, previous); await fs.rm(dir, { recursive: true, force: true }); }
});
