import { useState } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, GitCommitHorizontal, GitFork, LoaderCircle, Send } from "lucide-react";
import type { ReproRun } from "./types";

export function GitHubSourceCard({ run, canPublish, onPublish }: {
  run: ReproRun;
  canPublish: boolean;
  onPublish: () => Promise<void>;
}) {
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  if (!run.source) return null;
  const source = run.source;
  const terminal = run.status === "completed" || run.status === "failed";

  const publish = async () => {
    setPublishing(true);
    setError("");
    try {
      await onPublish();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "发布失败");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <section className="github-source panel">
      <div className="github-source-title">
        <div className="github-source-icon"><GitFork size={20} /></div>
        <div>
          <span className="section-kicker">GITHUB CONTEXT</span>
          <h3>{source.repository} · Issue #{source.issueNumber}</h3>
          <p>{source.issueTitle}</p>
        </div>
      </div>
      <div className="github-source-meta">
        <span><GitCommitHorizontal size={14} /><code>{source.headSha.slice(0, 7)}</code></span>
        <span className={`publish-state ${source.publishStatus}`}>
          {source.publishStatus === "published" ? <CheckCircle2 size={14} /> : source.publishStatus === "failed" ? <AlertTriangle size={14} /> : <LoaderCircle size={14} />}
          {source.publishStatus === "published" ? "已同步 GitHub" : source.publishStatus === "failed" ? "同步失败" : "等待同步"}
        </span>
        <a href={source.issueUrl} target="_blank" rel="noreferrer">查看 Issue <ArrowUpRight size={12} /></a>
        {source.checkUrl && <a href={source.checkUrl} target="_blank" rel="noreferrer">查看 Check <ArrowUpRight size={12} /></a>}
      </div>
      <button className="secondary-button github-publish" onClick={() => void publish()} disabled={!terminal || !canPublish || publishing}>
        {publishing ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}
        {source.publishStatus === "published" ? "重新发布报告" : "发布到 GitHub"}
      </button>
      {!canPublish && <small className="github-hint">请在服务端配置 REPROLENS_GITHUB_TOKEN 后启用回写。</small>}
      {(error || source.publishError) && <div className="form-error"><AlertTriangle size={14} /> {error || source.publishError}</div>}
    </section>
  );
}
