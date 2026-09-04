import { useState, type FormEvent } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, GitFork, LoaderCircle, Play } from "lucide-react";
import { api } from "./api";
import type { AppConfig, ReproRun } from "./types";

export function GitHubImport({ config, onImported }: { config?: AppConfig; onImported: (run: ReproRun) => void }) {
  const [issueUrl, setIssueUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await api.importGitHubIssue(issueUrl);
      onImported(result.run);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "GitHub Issue 导入失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="github-import panel">
      <div className="github-import-copy">
        <span className="section-kicker"><GitFork size={14} /> GITHUB WORKFLOW</span>
        <h3>从 Issue 直接创建复现任务</h3>
        <p>粘贴公开或已授权仓库的 Issue 地址，ReproLens 会读取目标地址、期望结果和设备，并在完成后回写 Check 与同一条报告评论。</p>
        <div className="github-capabilities">
          <span><CheckCircle2 size={14} /> 标签触发</span>
          <span><CheckCircle2 size={14} /> 幂等执行</span>
          <span><CheckCircle2 size={14} /> Checks + 评论</span>
        </div>
      </div>
      <form onSubmit={submit}>
        <label htmlFor="github-issue-url">GitHub Issue URL</label>
        <div className="github-import-row">
          <div className="input-shell">
            <GitFork size={17} />
            <input
              id="github-issue-url"
              type="url"
              required
              value={issueUrl}
              onChange={(event) => setIssueUrl(event.target.value)}
              placeholder="https://github.com/owner/repo/issues/123"
            />
          </div>
          <button className="primary-button" disabled={loading}>
            {loading ? <LoaderCircle className="spin" size={17} /> : <Play size={17} fill="currentColor" />}
            {loading ? "正在导入" : "导入并验证"}
          </button>
        </div>
        <div className="github-import-meta">
          <span className={config?.github.configured ? "configured" : ""}>
            {config?.github.configured ? "GitHub 回写已启用" : "未配置 Token：可读取公开 Issue，但不能回写"}
          </span>
          <a href="https://github.com/liancheng2020/reprolens#github-actions-集成" target="_blank" rel="noreferrer">
            配置指南 <ArrowUpRight size={12} />
          </a>
        </div>
        {error && <div className="form-error"><AlertTriangle size={15} /> {error}</div>}
      </form>
    </section>
  );
}
