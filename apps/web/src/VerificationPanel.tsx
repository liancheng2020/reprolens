import { useState, type FormEvent } from "react";
import { ArrowRight, GitCompare, Image, LoaderCircle, RotateCcw, TriangleAlert } from "lucide-react";
import type { DeviceName, ReproRun } from "./types";

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
    if (["/demo/shop", "/demo/modal", "/demo/profile"].includes(url.pathname)) url.searchParams.set("fixed", "1");
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

  if (run.status !== "completed" || !run.input.planConfirmed || !run.screenshots.length) return null;

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
          <h3>{verification ? "修复重放结果" : "重放已确认计划验证修复"}</h3>
          <p>业务是否修复以核心检查为准。下方视觉变化仅供辅助参考。请仅重放到已授权的测试站点。</p>
        </div>
      </div>

      {comparison && verification ? (
        <details className="quality-disclosure">
          <summary>Before / After 像素对比（辅助证据）</summary>
          <div className="verification-metrics">
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
        </details>
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
