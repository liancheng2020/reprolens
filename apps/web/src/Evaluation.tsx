import { useEffect, useState } from "react";
import { ArrowUpRight, Download, FlaskConical, LoaderCircle, Play, RefreshCw } from "lucide-react";
import type { EvalCase } from "../../api/src/evaluation/cases";
import type { EvalReport } from "../../api/src/evaluation/report";
import { verdictLabels } from "./Business";
import "./evaluation.css";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/evaluations${path}`, init);
  if (!response.ok) { const body = await response.json(); throw new Error(body.error ?? `请求失败 (${response.status})`); }
  return response.json();
}
const percent = (value: number | null | undefined) => value == null ? "—" : `${(value * 100).toFixed(0)}%`;

export function Evaluation() {
  const [cases, setCases] = useState<EvalCase[]>([]);
  const [report, setReport] = useState<EvalReport | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [suite, setSuite] = useState<"smoke" | "full">("smoke");
  const [ready, setReady] = useState(false);
  const running = report?.status === "running";
  const visibleCases = cases.filter(item => suite === "full" || item.smoke);
  const load = async () => {
    try {
      const [items, latest] = await Promise.all([request<EvalCase[]>("/cases"), request<EvalReport | null>("/latest")]);
      setCases(items); setReport(latest); setReady(true); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "无法读取评测"); }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!running) return;
    let disposed = false;
    let timer: number;
    const poll = async () => {
      try { const next = await request<EvalReport | null>("/latest"); if (!disposed) { setReport(next); setError(""); } }
      catch (e) { if (!disposed) setError(e instanceof Error ? e.message : "进度读取失败"); }
      if (!disposed) timer = window.setTimeout(poll, 1000);
    };
    timer = window.setTimeout(poll, 1000);
    return () => { disposed = true; clearTimeout(timer); };
  }, [running]);
  const start = async () => {
    setBusy(true); setError("");
    try { setReport(await request<EvalReport>("", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ suite }) })); }
    catch (e) { setError(e instanceof Error ? e.message : "启动失败"); }
    finally { setBusy(false); }
  };
  return <>
    <header className="topbar"><div><h1>评测实验室</h1><p>固定计划 / 执行器回归 · 数据集 v1</p></div><FlaskConical size={22} /></header>
    <div className="content evaluation">
      <section className="eval-toolbar">
        <div><h2>双版本验证</h2><p>输入后失焦仍保留值 · 同一计划 / 同一回归测试</p></div>
        <div className="eval-actions"><label>用例集 <select value={suite} disabled={running || busy} onChange={e => setSuite(e.target.value as "smoke" | "full")}><option value="smoke">冒烟 · 4 条</option><option value="full">完整 · 20 条</option></select></label>
          <button className="primary-button" disabled={!ready || running || busy} onClick={() => void start()}>{running || busy ? <LoaderCircle size={16} className="spin" /> : <Play size={16} />}{running ? `运行中 ${report.results.length}/${report.total}` : "运行评测"}</button>
          <button className="icon-button" title="刷新评测" aria-label="刷新评测" onClick={() => void load()}><RefreshCw size={17} /></button></div>
      </section>
      {error && <p role="alert" className="eval-error">{error}</p>}
      <div className="eval-demo-links">
        <a href="/demo/eval/blur?fixed=0" target="_blank" rel="noreferrer"><span>缺陷版</span><strong>失焦后内容清空</strong><ArrowUpRight size={18} /></a>
        <a href="/demo/eval/blur?fixed=1" target="_blank" rel="noreferrer"><span>修复版</span><strong>失焦后内容保留</strong><ArrowUpRight size={18} /></a>
      </div>
      <section className="eval-report" aria-live="polite">
        <div className="eval-toolbar"><h3>{!report ? "尚无评测结果" : running ? (report.results.length === report.total ? "正在重跑生成的回归测试" : "正在验证业务断言") : report.passed ? "评测预期全部满足" : "评测未通过"}</h3>
          {report && !running && <a href={`${report.artifactsUrl}/report.json`} target="_blank" rel="noreferrer"><Download size={16} /> JSON 报告</a>}</div>
        {report?.error && <p role="alert" className="eval-error">{report.error}</p>}
        {report && <p className="eval-muted">本次运行：{report.suite === "smoke" ? "冒烟集" : "完整集"} · {report.results.length}/{report.total} 条 · {new Date(report.startedAt).toLocaleString("zh-CN")}</p>}
        <dl className="eval-metrics">
          <div><dt>用例符合率</dt><dd>{percent(report?.metrics?.casePassRate)}</dd></div>
          <div><dt>判定准确率</dt><dd>{percent(report?.metrics?.verdictAccuracy)}</dd></div>
          <div><dt>误报率</dt><dd>{percent(report?.metrics?.falsePositiveRate)}</dd></div>
          <div><dt>平均耗时</dt><dd>{report?.metrics?.averageDurationMs == null ? "—" : `${(report.metrics.averageDurationMs / 1000).toFixed(1)}s`}</dd></div>
        </dl>
        <p className="eval-muted">仅评估固定计划的执行与判定，不代表模型规划准确率。模型调用 0 次；token / cost 不适用。</p>
        {!!report?.replay.length && <div className="eval-replay"><h4>生成测试重跑</h4>{report.replay.map(item => <p key={String(item.fixed)} className={item.passed ? "eval-pass" : "eval-error"}>{item.fixed ? "修复版" : "缺陷版"}：预期{item.expected === "passed" ? "通过" : "断言失败"} / 实际{item.actual === "passed" ? "通过" : item.actual === "failed" ? "断言失败" : "运行异常"} · {item.passed ? "符合预期" : "不符合预期"}{item.error && <small>{item.error}</small>}</p>)}<a href={`${report.artifactsUrl}/regression.spec.ts`} target="_blank" rel="noreferrer">查看同一份回归测试 <ArrowUpRight size={14} /></a></div>}
      </section>
      <section className="eval-cases"><h3>评测用例 <span className="eval-muted">{visibleCases.length} / {cases.length}</span></h3>
        {visibleCases.map(item => {
          const result = report?.results.find(r => r.id === item.id);
          return <details key={item.id} className="eval-case"><summary><span><b>{item.title}</b><small>{item.id} · {item.fixed ? "修复版" : "缺陷 / 受阻版"}</small></span><span>预期：{verdictLabels[item.expected]}</span><strong className={result ? result.passed ? "eval-pass" : "eval-error" : "eval-muted"}>{result ? result.passed ? "符合预期" : "不符合预期" : "未运行"}</strong></summary>
            <div className="eval-case-body"><a href={`/demo/eval/${item.fixture}?fixed=${item.fixed ? 1 : 0}`} target="_blank" rel="noreferrer">打开场景 <ArrowUpRight size={14} /></a><p>实际判定：{result ? result.actual === "error" ? "运行异常" : verdictLabels[result.actual] : "未运行"}</p>
              {result?.error && <p className="eval-error">{result.error}</p>}
              {result?.steps.map(step => <div className="eval-step" key={step.index}><strong>{step.index + 1}. {step.title} · {step.status}</strong><p>期望：{step.expected}</p><p>实际：{step.actual}</p>{step.detail && <pre>{step.detail}</pre>}<div className="eval-evidence">{[step.beforeUrl, step.afterUrl].map((url, i) => url ? <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt={i ? "执行后" : "执行前"} loading="lazy" /></a> : null)}</div></div>)}
              <details><summary>固定计划</summary><pre>{JSON.stringify(item.plan, null, 2)}</pre></details>
            </div></details>;
        })}
      </section>
    </div>
  </>;
}
