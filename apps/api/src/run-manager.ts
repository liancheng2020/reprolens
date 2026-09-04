import { randomUUID } from "node:crypto";
import type { Response } from "express";
import { config } from "./config.js";
import { DeepSeekProvider } from "./provider.js";
import { BrowserScanner } from "./scanner.js";
import { RunStore } from "./store.js";
import type { CreateRunInput, Finding, ReproRun, ScreenshotArtifact, TimelineItem } from "./types.js";

export class RunManager {
  private readonly subscribers = new Map<string, Set<Response>>();
  private readonly provider = new DeepSeekProvider();
  private readonly scanner = new BrowserScanner(this.provider);

  constructor(private readonly store: RunStore) {}

  get providerConfigured(): boolean {
    return this.provider.configured;
  }

  async create(input: CreateRunInput): Promise<ReproRun> {
    const now = new Date().toISOString();
    const run: ReproRun = {
      id: randomUUID(),
      createdAt: now,
      status: "queued",
      currentStep: "等待执行",
      input,
      provider: this.provider.configured ? "deepseek" : "deterministic",
      model: this.provider.configured ? config.deepseekModel : undefined,
      timeline: [],
      findings: [],
      screenshots: [],
      metrics: {
        durationMs: 0,
        consoleErrors: 0,
        networkErrors: 0,
        accessibilityIssues: 0,
        testedDevices: input.devices.length
      }
    };
    await this.store.save(run);
    setImmediate(() => void this.execute(run.id));
    return run;
  }

  async subscribe(id: string, response: Response): Promise<boolean> {
    const run = await this.store.get(id);
    if (!run) return false;

    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();
    response.write(`data: ${JSON.stringify({ event: null, run })}\n\n`);

    if (run.status === "completed" || run.status === "failed") {
      response.end();
      return true;
    }

    const clients = this.subscribers.get(id) ?? new Set<Response>();
    clients.add(response);
    this.subscribers.set(id, clients);
    response.on("close", () => {
      clients.delete(response);
      if (!clients.size) this.subscribers.delete(id);
    });
    return true;
  }

  private async push(
    run: ReproRun,
    type: TimelineItem["type"],
    title: string,
    detail: string | undefined,
    state: TimelineItem["state"]
  ): Promise<void> {
    const event: TimelineItem = {
      id: randomUUID(),
      at: new Date().toISOString(),
      type,
      title,
      detail,
      state
    };
    run.currentStep = title;
    run.timeline.push(event);
    await this.store.save(run);
    this.broadcast(run, event);
  }

  private broadcast(run: ReproRun, event: TimelineItem): void {
    const payload = `data: ${JSON.stringify({ event, run })}\n\n`;
    for (const response of this.subscribers.get(run.id) ?? []) response.write(payload);
  }

  private finishStream(id: string): void {
    for (const response of this.subscribers.get(id) ?? []) response.end();
    this.subscribers.delete(id);
  }

  private async execute(id: string): Promise<void> {
    const run = await this.store.get(id);
    if (!run) return;
    run.status = "running";
    await this.push(run, "status", "任务开始", "正在准备浏览器环境", "running");

    try {
      const result = await this.scanner.scan(run.id, run.input, {
        step: async (title, detail) => this.push(run, "step", title, detail, "success"),
        screenshot: async (artifact: ScreenshotArtifact) => {
          run.screenshots.push(artifact);
          await this.push(run, "screenshot", `已采集 ${artifact.label}`, `${artifact.viewport.width} × ${artifact.viewport.height}`, "success");
        },
        finding: async (finding: Finding) => {
          run.findings.push(finding);
          await this.push(
            run,
            "finding",
            finding.title,
            `${finding.device} · ${finding.category}`,
            finding.severity === "high" ? "error" : "warning"
          );
        }
      });

      run.status = "completed";
      run.completedAt = new Date().toISOString();
      run.currentStep = "分析完成";
      run.score = result.score;
      run.verdict = result.verdict;
      run.confidence = result.confidence;
      run.summary = result.summary;
      run.generatedTest = result.generatedTest;
      run.provider = result.provider;
      run.metrics = {
        durationMs: result.durationMs,
        consoleErrors: result.consoleErrors,
        networkErrors: result.networkErrors,
        accessibilityIssues: result.accessibilityIssues,
        testedDevices: run.input.devices.length
      };
      await this.push(run, "complete", "分析完成", `${result.findings.length} 个发现 · 质量评分 ${result.score}`, "success");
    } catch (error) {
      run.status = "failed";
      run.completedAt = new Date().toISOString();
      run.error = error instanceof Error ? error.message : "Unknown scanner error";
      await this.push(run, "error", "任务执行失败", run.error, "error");
    } finally {
      this.finishStream(id);
    }
  }
}
