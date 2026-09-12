import express from "express";
import { evalCases } from "./cases.js";
import { newReport, runEvaluation } from "./runner.js";
import type { EvalReport } from "./report.js";

export function evaluationRouter() {
  const router = express.Router();
  let latest: EvalReport | undefined;
  let running = false;
  router.get("/cases", (_req, res) => res.json(evalCases));
  router.get("/latest", (_req, res) => res.json(latest ?? null));
  router.post("/", (req, res) => {
    if (req.body?.suite !== "smoke" && req.body?.suite !== "full") { res.status(422).json({ error: "suite 必须为 smoke 或 full" }); return; }
    if (running) { res.status(409).json({ error: "已有评测正在运行，请等待当前任务完成" }); return; }
    running = true;
    latest = newReport(req.body.suite);
    res.status(202).json(latest);
    void runEvaluation(latest).catch(error => {
      latest!.status = "failed"; latest!.passed = false; latest!.error = String(error);
    }).finally(() => { running = false; });
  });
  return router;
}
