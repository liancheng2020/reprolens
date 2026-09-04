import { setTimeout as delay } from "node:timers/promises";
import { config } from "../config.js";
import { RunManager } from "../run-manager.js";
import { RunStore } from "../store.js";
import type { GitHubRunSource, ReproRun } from "../types.js";
import { GitHubClient } from "./client.js";
import { issueToRunInput, parseRepositoryConfig } from "./issue-parser.js";
import { publishGitHubRun } from "./publisher.js";
import type { IssueImportRequest, IssuesLabeledEvent, RepositoryConfig } from "./types.js";

export class GitHubService {
  constructor(
    private readonly store: RunStore,
    private readonly manager: RunManager,
    private readonly token = config.githubToken
  ) {}

  get configured(): boolean {
    return Boolean(this.token);
  }

  private async context(repository: string): Promise<{ client: GitHubClient; config: RepositoryConfig; branch: string }> {
    const client = new GitHubClient(repository, this.token);
    const repo = await client.getRepository();
    const source = await client.getTextFile(".github/reprolens.yml", repo.default_branch);
    return {
      client,
      config: parseRepositoryConfig(source, config.githubTriggerLabel),
      branch: repo.default_branch
    };
  }

  async importIssue(request: IssueImportRequest): Promise<{ run: ReproRun; created: boolean }> {
    const { client, config: repositoryConfig, branch } = await this.context(request.repository);
    const [issue, commit] = await Promise.all([
      client.getIssue(request.issueNumber),
      request.headSha ? Promise.resolve({ sha: request.headSha }) : client.getCommit(branch)
    ]);
    const existing = (await this.store.list()).find((run) =>
      run.source?.type === "github"
      && run.source.repository === request.repository
      && run.source.issueNumber === request.issueNumber
      && run.source.headSha === commit.sha
    );
    if (existing) return { run: existing, created: false };

    const source: GitHubRunSource = {
      type: "github",
      repository: request.repository,
      issueNumber: request.issueNumber,
      issueUrl: request.issueUrl,
      issueTitle: issue.title,
      headSha: commit.sha,
      trigger: request.trigger,
      publishStatus: "pending"
    };

    if (repositoryConfig.publish.checkRun && client.authenticated) {
      const check = await client.createCheckRun({
        name: "ReproLens visual verification",
        head_sha: commit.sha,
        status: "in_progress",
        started_at: new Date().toISOString(),
        details_url: request.issueUrl,
        output: { title: "ReproLens 正在验证 Issue", summary: `正在分析 #${issue.number}：${issue.title}` }
      });
      source.checkRunId = check.id;
      source.checkUrl = check.html_url;
    }

    const run = await this.manager.create(issueToRunInput(issue, repositoryConfig), source);
    return { run, created: true };
  }

  async handleLabeledEvent(event: IssuesLabeledEvent): Promise<{ accepted: boolean; run?: ReproRun; created?: boolean }> {
    const { config: repositoryConfig } = await this.context(event.repository.full_name);
    if (event.label.name !== repositoryConfig.triggerLabel) return { accepted: false };
    const result = await this.importIssue({
      repository: event.repository.full_name,
      issueNumber: event.issue.number,
      issueUrl: event.issue.html_url,
      trigger: "label"
    });
    return { accepted: true, ...result };
  }

  async publish(runId: string): Promise<ReproRun> {
    const run = await this.store.get(runId);
    if (!run) throw new Error("任务不存在");
    if (!["completed", "failed"].includes(run.status)) throw new Error("任务尚未结束，暂时不能发布");
    if (!run.source) throw new Error("当前任务不是 GitHub Issue 任务");
    const { client, config: repositoryConfig } = await this.context(run.source.repository);
    try {
      await publishGitHubRun(client, run, repositoryConfig);
    } finally {
      await this.store.save(run);
    }
    return run;
  }

  async waitForCompletion(runId: string, timeoutMs = 10 * 60 * 1000): Promise<ReproRun> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const run = await this.store.get(runId);
      if (!run) throw new Error("任务不存在");
      if (["completed", "failed"].includes(run.status)) return run;
      await delay(750);
    }
    throw new Error("等待 ReproLens 任务完成超时");
  }

  publishWhenFinished(runId: string): void {
    void this.waitForCompletion(runId)
      .then(() => this.publish(runId))
      .catch((error) => console.error(`[reprolens:github] ${error instanceof Error ? error.message : String(error)}`));
  }
}
