import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { config } from "../src/config.js";
import { RunStore } from "../src/store.js";
import type { PlanningRecord } from "../src/types.js";

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
