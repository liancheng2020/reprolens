import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import type { PlanningRecord, ReproRun } from "./types.js";

export class RunStore {
  async init(): Promise<void> {
    await fs.mkdir(config.dataDir, { recursive: true });
    await fs.mkdir(config.artifactsDir, { recursive: true });
    await fs.mkdir(path.join(config.dataDir, "plans"), { recursive: true });
  }

  async savePlan(record: PlanningRecord): Promise<void> {
    const target = path.join(config.dataDir, "plans", `${record.id}.json`);
    await fs.writeFile(`${target}.tmp`, JSON.stringify(record, null, 2), "utf8");
    await fs.rename(`${target}.tmp`, target);
  }

  async getPlan(id: string): Promise<PlanningRecord | undefined> {
    if (!/^[a-f0-9-]+$/i.test(id)) return undefined;
    try { return JSON.parse(await fs.readFile(path.join(config.dataDir, "plans", `${id}.json`), "utf8")) as PlanningRecord; }
    catch { return undefined; }
  }

  async save(run: ReproRun): Promise<void> {
    const target = path.join(config.dataDir, `${run.id}.json`);
    const temporary = `${target}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(run, null, 2), "utf8");
    await fs.rename(temporary, target);
  }

  async get(id: string): Promise<ReproRun | undefined> {
    if (!/^[a-f0-9-]+$/i.test(id)) return undefined;
    try {
      return JSON.parse(await fs.readFile(path.join(config.dataDir, `${id}.json`), "utf8")) as ReproRun;
    } catch {
      return undefined;
    }
  }

  async list(): Promise<ReproRun[]> {
    await this.init();
    const names = (await fs.readdir(config.dataDir)).filter((name) => name.endsWith(".json"));
    const runs = await Promise.all(names.map((name) => this.get(name.replace(/\.json$/, ""))));
    return runs
      .filter((run): run is ReproRun => Boolean(run))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async recoverInterrupted(): Promise<number> {
    const interrupted = (await this.list()).filter(run => run.status === "queued" || run.status === "running");
    for (const run of interrupted) {
      run.status = "failed";
      run.completedAt = new Date().toISOString();
      run.currentStep = "执行已中断";
      run.error = "服务重启导致任务中断，未自动重放操作。请检查已有证据后重新确认执行。";
      run.verdict = "inconclusive";
      if (run.verification?.business) {
        run.verification.business.status = "inconclusive";
        run.verification.business.summary = run.error;
      }
      await this.save(run);
    }
    return interrupted.length;
  }
}
