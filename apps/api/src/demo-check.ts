import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import { config } from "./config.js";
import { demoRouter, demoScenarios } from "./demo-scenarios.js";
import { demoShopHtml } from "./demo-page.js";
import { RunManager } from "./run-manager.js";
import { RunStore } from "./store.js";
import type { ReproRun } from "./types.js";

// Exercise the real run manager and repair comparison without an LLM or user data.
const root = await fs.mkdtemp(path.join(os.tmpdir(), "reprolens-demo-check-"));
config.dataDir = path.join(root, "runs");
config.artifactsDir = path.join(root, "artifacts");
const app = express();
app.use("/demo", demoRouter());
app.get("/demo/shop", (req, res) => res.type("html").send(demoShopHtml(req.query.fixed === "1")));
app.post("/demo/api/cart", (req, res) => res.status(req.query.fixed === "1" ? 200 : 500).json({ count: req.query.fixed === "1" ? 1 : 0 }));
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
const address = server.address();
assert(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
const store = new RunStore();
await store.init();
const manager = new RunManager(store);
async function complete(id: string): Promise<ReproRun> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const run = await store.get(id);
    if (run && ["completed", "failed"].includes(run.status)) { assert.equal(run.status, "completed", run.error ?? "Task failed"); return run; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Task timed out: ${id}`);
}
try {
  const results = [];
  for (const demo of demoScenarios) {
    const input = { ...demo, url: origin + demo.path, planConfirmed: true, qualityScan: false };
    const bug = await complete((await manager.create(input)).id);
    assert.equal(bug.verdict, "reproduced", demo.id);
    assert(bug.business?.steps.some(step => step.phase === "check" && step.status === "failed"));
    assert.equal(bug.screenshots.length, demo.devices.length);
    const url = new URL(input.url); url.searchParams.set("fixed", "1");
    const fixed = await complete((await manager.create({ ...input, url: url.href, baselineRunId: bug.id })).id);
    assert.equal(fixed.verdict, "not_reproduced", demo.id);
    assert.equal(fixed.verification?.business?.status, "fixed", demo.id);
    assert(fixed.business?.steps.every(step => step.status === "passed"));
    results.push({ scenario: demo.id, devices: demo.devices, bug: bug.verdict, fixed: fixed.verdict, verification: fixed.verification?.business?.status });
    console.log(`PASS ${demo.id}: reproduced -> fixed`);
  }
  const report = { date: new Date().toISOString(), modelCalls: 0, results, artifacts: root };
  await fs.writeFile(path.join(root, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { server.close(); }
