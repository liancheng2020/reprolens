import { useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, GitCompare, Image, LoaderCircle, RotateCcw, TriangleAlert } from "lucide-react";
import type { DeviceName, ReproRun, VerificationStatus } from "./types";

const statusCopy: Record<VerificationStatus, { label: string; icon: typeof CheckCircle2 }> = {
  improved: { label: "修复有效", icon: CheckCircle2 },
  regressed: { label: "发现回归", icon: TriangleAlert },
  changed: { label: "视觉已变化", icon: GitCompare },
  unchanged: { label: "基本无变化", icon: RotateCcw }
};

const deviceLabels: Record<DeviceName, string> = {
  desktop: "Desktop",
  iphone13: "iPhone 13",
  pixel7: "Pixel 7"
};

interface Props {
  run: ReproRun;
  activeDevice: DeviceName;
  onVerify(url: string): Promise<void>;
}

function suggestedFixUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.pathname === "/demo/shop" && !url.searchParams.has("fixed")) url.searchParams.set("fixed", "1");
    return url.toString();
  } catch {
    return value;
  }
}

export function VerificationPanel({ run, activeDevice, onVerify }: Props) {
  const [url, setUrl] = useState(() => suggestedFixUrl(run.input.url));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const verification = run.verification;
  const comparison = verification?.comparisons.find((item) => item.device === activeDevice)
    ?? verification?.comparisons[0];

  if (run.status !== "completed") return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await onVerify(url);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "创建验证任务失败");
      setSubmitting(false);
    }
  };

  return (
    <section className="verification-panel panel">
      <div className="verification-heading">
        <div>
          <span className="section-kicker">FIX VERIFICATION</span>
          <h3>{verification ? "Before / After 修复验证" : "用当前运行创建修复基线"}</h3>
          <p>{verification?.summary ?? "修复完成后输入新地址，ReproLens 会重放相同路径并生成逐像素证据。"}</p>
        </div>
        {verification && (() => {
          const StatusIcon = statusCopy[verification.status].icon;
          return <span className={`verification-status ${verification.status}`}><StatusIcon size={15} />{statusCopy[verification.status].label}</span>;
        })()}
      </div>

      {comparison && verification ? (
        <>
          <div className="verification-metrics">
            <div><span>质量分变化</span><strong className={verification.scoreDelta >= 0 ? "positive" : "negative"}>{verification.scoreDelta > 0 ? "+" : ""}{verification.scoreDelta}</strong></div>
            <div><span>已解决</span><strong>{verification.resolvedFindings}</strong></div>
            <div><span>新引入</span><strong>{verification.introducedFindings}</strong></div>
            <div><span>{deviceLabels[comparison.device]} 像素变化</span><strong>{(comparison.mismatchRatio * 100).toFixed(2)}%</strong></div>
          </div>
          <div className="comparison-grid">
            {[
              ["BEFORE", comparison.baselineUrl, "基线截图"],
              ["AFTER", comparison.currentUrl, "验证截图"],
              ["PIXEL DIFF", comparison.diffUrl, "像素差异"]
            ].map(([label, source, alt]) => (
              <figure key={label}>
                <figcaption><span>{label}</span>{label === "PIXEL DIFF" && <small><Image size={12} /> 红色为变化区域</small>}</figcaption>
                <div><img src={source} alt={`${deviceLabels[comparison.device]} ${alt}`} /></div>
              </figure>
            ))}
          </div>
        </>
      ) : (
        <div className="verification-empty"><GitCompare size={34} /><span>尚未执行修复对比</span></div>
      )}

      <form className="verification-form" onSubmit={submit}>
        <label>
          <span>{verification ? "继续验证的新版本地址" : "修复后页面地址"}</span>
          <input value={url} onChange={(event) => setUrl(event.target.value)} type="url" required />
        </label>
        <button disabled={submitting}>
          {submitting ? <LoaderCircle className="spin" size={16} /> : <RotateCcw size={16} />}
          {submitting ? "正在创建" : verification ? "再次验证" : "验证修复"}
          {!submitting && <ArrowRight size={15} />}
        </button>
      </form>
      {error && <div className="verification-error"><TriangleAlert size={14} />{error}</div>}
    </section>
  );
}
