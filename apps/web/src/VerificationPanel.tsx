import { useState, type FormEvent } from "react";
import { ArrowRight, GitCompare, Image, LoaderCircle, RotateCcw, TriangleAlert } from "lucide-react";
import type { DeviceName, ReproRun } from "./types";

const deviceLabels: Record<DeviceName, string> = {
  desktop: "Desktop",
  iphone13: "iPhone 13",
  pixel7: "Pixel 7"
};

const fixLabels = { fixed: "范围内修复验证通过", still_reproduced: "原问题仍可复现", regressed: "其他核心检查失败", inconclusive: "修复证据不足", not_comparable: "检查标准不可比较", no_baseline_failure: "基线未复现，不能证明修复" };
const stepLabels = { passed: "通过", failed: "失败", blocked: "受阻", skipped: "跳过" };

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
  const fix = verification?.business;
  const comparison = verification?.comparisons.find((item) => item.device === activeDevice)
    ?? verification?.comparisons[0];

  if (!verification && (run.status !== "completed" || !run.input.planConfirmed || !run.screenshots.length)) return null;

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

      {fix ? <div className={"fix-result " + fix.status}>
        <h3>{fixLabels[fix.status]}</h3>
        <p>{fix.summary}</p>
        <p>基线任务：{verification!.baselineRunId} · {fix.comparable ? "计划、设备与预期一致" : "不可按同一标准比较"}</p>
        {fix.comparable && <>
          <p>原失败项通过 {fix.resolvedFailures}/{fix.originalFailures} · 其他核心失败 {fix.otherFailures}</p>
          {fix.steps.filter(step => step.phase === "check").map(step => <details className="fix-step" key={step.device + step.index} open={step.baseline?.status === "failed" || step.current?.status !== "passed"}>
            <summary>{deviceLabels[step.device]} · {step.index + 1}. {step.title}：{step.baseline ? stepLabels[step.baseline.status] : "缺失"} → {step.current ? stepLabels[step.current.status] : "缺失"}</summary>
            <div className="fix-evidence">{([["修复前", step.baseline], ["修复后", step.current]] as const).map(([label, evidence]) => <div key={label}>
              <strong>{label}</strong><p>期望：{evidence?.expected ?? "未记录"}</p><p>实际：{evidence?.actual ?? "未执行或证据缺失"}</p>
              {evidence?.afterUrl && <a href={evidence.afterUrl} target="_blank" rel="noreferrer">查看步骤截图</a>}
            </div>)}</div>
          </details>)}
        </>}
      </div> : verification && <p>旧记录没有业务修复判定；以下像素变化不能证明目标问题已修复。</p>}

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
        <div className="verification-empty"><GitCompare size={34} /><span>{verification ? "未生成辅助像素对比；业务结论见上方" : "尚未执行修复对比"}</span></div>
      )}

      {run.status === "completed" && <form className="verification-form" onSubmit={submit}>
        <label>
          <span>{verification ? "继续验证的新版本地址" : "修复后页面地址"}</span>
          <input value={url} onChange={(event) => setUrl(event.target.value)} type="url" required />
        </label>
        <button disabled={submitting}>
          {submitting ? <LoaderCircle className="spin" size={16} /> : <RotateCcw size={16} />}
          {submitting ? "正在创建" : verification ? "再次验证" : "验证修复"}
          {!submitting && <ArrowRight size={15} />}
        </button>
      </form>}
      {error && <div className="verification-error"><TriangleAlert size={14} />{error}</div>}
    </section>
  );
}
