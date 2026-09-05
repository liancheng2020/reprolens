import type { ReproRun } from "../types.js";
import { GitHubClient } from "./client.js";
import type { RepositoryConfig } from "./types.js";

export const REPORT_MARKER = "<!-- reprolens-report -->";

export function checkConclusion(run: ReproRun): "success" | "failure" | "neutral" {
  if (run.status === "failed" || run.verdict === "reproduced" || run.verification?.status === "regressed" || run.quality?.gate.status === "failed") return "failure";
  if (run.verdict === "not_reproduced" || run.verification?.status === "improved") return "success";
  return "neutral";
}

export function buildGitHubReport(run: ReproRun): string {
  const verdict = run.status === "failed"
    ? "执行失败"
    : run.verdict === "reproduced"
      ? "已复现"
      : run.verdict === "not_reproduced" ? "未复现" : "结果不确定";
  const findings = run.findings.length
    ? run.findings.slice(0, 10).map((item) => `- **[${item.severity}] ${item.title}**（${item.device} / ${item.category}）：${item.evidence}`).join("\n")
    : "- 未发现结构化异常";
  const verification = run.verification
    ? `\n- 修复验证：**${run.verification.status}**（评分变化 ${run.verification.scoreDelta >= 0 ? "+" : ""}${run.verification.scoreDelta}）`
    : "";
  const quality = run.quality
    ? `\n- 质量门禁：**${run.quality.gate.status}**${run.quality.gate.reasons.length ? `（${run.quality.gate.reasons.join("；")}）` : ""}\n- 可访问性问题：${run.quality.categoryCounts.accessibility}；性能问题：${run.quality.categoryCounts.performance}`
    : "";

  return `${REPORT_MARKER}
## ReproLens 自动验证报告

| 项目 | 结果 |
| --- | --- |
| 状态 | **${verdict}** |
| 质量评分 | ${run.score ?? "—"} / 100 |
| 置信度 | ${run.confidence ?? "—"}% |
| 测试设备 | ${run.input.devices.join(", ")} |
| 运行编号 | \`${run.id}\` |

${run.summary ?? run.error ?? "任务已完成。"}
${verification}
${quality}

### 关键发现

${findings}

### 可交付证据

- 截图：${run.screenshots.length} 张
- 视觉对比：${run.verification?.comparisons.length ?? 0} 组 Before / After / Diff
- Playwright 回归测试：${run.generatedTest ? "已生成" : "未生成"}

> 完整截图、Diff、JSON 与测试文件请从对应 GitHub Actions 运行的 Artifacts 下载。

_该评论由 ReproLens 自动维护；重复发布会更新本条评论，不会刷屏。_
`;
}

export async function publishGitHubRun(client: GitHubClient, run: ReproRun, repositoryConfig: RepositoryConfig): Promise<ReproRun> {
  if (!run.source) throw new Error("当前任务不是 GitHub Issue 任务");
  if (!client.authenticated) throw new Error("未配置 REPROLENS_GITHUB_TOKEN 或 GITHUB_TOKEN，无法回写 GitHub");
  const report = buildGitHubReport(run);
  run.source.publishStatus = "publishing";
  run.source.publishError = undefined;

  try {
    if (repositoryConfig.publish.issueComment) {
      const comments = await client.listIssueComments(run.source.issueNumber);
      const existing = comments.find((item) => item.body.includes(REPORT_MARKER));
      const comment = existing
        ? await client.updateIssueComment(existing.id, report)
        : await client.createIssueComment(run.source.issueNumber, report);
      run.source.commentId = comment.id;
    }

    if (repositoryConfig.publish.checkRun) {
      const payload = {
        name: "ReproLens visual verification",
        head_sha: run.source.headSha,
        status: "completed",
        conclusion: checkConclusion(run),
        completed_at: run.completedAt ?? new Date().toISOString(),
        details_url: run.source.issueUrl,
        output: {
          title: `ReproLens：${run.status === "failed" ? "执行失败" : run.summary ?? "验证完成"}`.slice(0, 255),
          summary: report.slice(0, 65000)
        }
      };
      const check = run.source.checkRunId
        ? await client.updateCheckRun(run.source.checkRunId, payload)
        : await client.createCheckRun(payload);
      run.source.checkRunId = check.id;
      run.source.checkUrl = check.html_url;
    }

    run.source.publishStatus = "published";
    run.source.publishedAt = new Date().toISOString();
    return run;
  } catch (error) {
    run.source.publishStatus = "failed";
    run.source.publishError = error instanceof Error ? error.message : "GitHub publish failed";
    throw error;
  }
}
