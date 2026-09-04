import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import type { ReproRun } from "./types.js";

export class RunStore {
  async init(): Promise<void> {
    await fs.mkdir(config.dataDir, { recursive: true });
    await fs.mkdir(config.artifactsDir, { recursive: true });
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
}
