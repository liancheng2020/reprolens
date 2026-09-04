import fs from "node:fs/promises";
import path from "node:path";
import { config, projectRoot } from "./config.js";
import { parseIssueUrl } from "./github/issue-parser.js";
import { buildGitHubReport } from "./github/publisher.js";
import { GitHubService } from "./github/service.js";
import { RunManager } from "./run-manager.js";
import { RunStore } from "./store.js";

async function readEvent(): Promise<Record<string, unknown>> {
  const path = process.env.GITHUB_EVENT_PATH;
  if (!path) return {};
  return JSON.parse(await fs.readFile(path, "utf8")) as Record<string, unknown>;
}

async function main(): Promise<void> {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) throw new Error("GITHUB_REPOSITORY is required");
  const event = await readEvent();
  const issue = event.issue as { number?: number; html_url?: string } | undefined;
  const issueNumber = Number(process.env.REPROLENS_ISSUE_NUMBER ?? issue?.number);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) throw new Error("Issue number is required");
  const issueUrl = issue?.html_url ?? `https://github.com/${repository}/issues/${issueNumber}`;
  const parsed = parseIssueUrl(issueUrl);

  const store = new RunStore();
  await store.init();
  const manager = new RunManager(store);
  const service = new GitHubService(store, manager);
  const { run } = await service.importIssue({
    ...parsed,
    trigger: "action",
    headSha: process.env.GITHUB_SHA
  });
  const completed = await service.waitForCompletion(run.id);
  const published = await service.publish(completed.id);
  const report = buildGitHubReport(published);
  const outputDir = path.join(projectRoot, "reports", "github", published.id);
  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outputDir, "report.md"), report, "utf8"),
    fs.writeFile(path.join(outputDir, "run.json"), JSON.stringify(published, null, 2), "utf8"),
    ...(published.generatedTest
      ? [fs.writeFile(path.join(outputDir, "repro.spec.ts"), published.generatedTest, "utf8")]
      : [])
  ]);
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, report, "utf8");
  console.log(`ReproLens run ${published.id} completed: ${published.source?.checkUrl ?? published.source?.issueUrl}`);
  if (published.status === "failed") process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[reprolens:github] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
