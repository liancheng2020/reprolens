import type { ReproRun } from "./types";

const sources = { model: "模型生成", template: "待编辑模板", demo: "固定示例", manual: "人工提供" };

export function RunProvenance({ run }: { run: ReproRun }) {
  const planning = run.planning;
  const plan = run.input.plan;
  const candidate = planning?.candidate;
  return <section className="run-provenance panel">
    <h3>计划来源与确认</h3>
    <dl>
      <dt>来源</dt><dd>{planning ? sources[planning.source] : "旧记录未保存规划来源"}{planning?.trace?.errorCode && ` · ${planning.trace.errorCode}`}</dd>
      <dt>页面观察</dt><dd>{planning?.observation ? `${planning.observation.device} · ${planning.observation.elements.length} 个初始元素 · ${planning.observation.durationMs}ms${planning.observation.truncated ? " · 已截断" : ""}` : "未记录页面观察"}</dd>
      <dt>确认状态</dt><dd>{planning?.confirmedAt ? `已确认 · ${new Date(planning.confirmedAt).toLocaleString("zh-CN")}` : run.input.planConfirmed ? "已确认，时间未记录" : "未确认"}</dd>
      <dt>人工编辑</dt><dd>{candidate ? planning?.edited ? "最终计划与候选计划不同" : "候选计划未修改" : "没有候选计划，无法比较"}</dd>
      {planning?.trace && <><dt>模型调用</dt><dd>{planning.trace.model} · {planning.trace.promptVersion} · {planning.trace.durationMs}ms · 输入 / 输出 token：{planning.trace.inputTokens ?? "未返回"} / {planning.trace.outputTokens ?? "未返回"}</dd></>}
    </dl>
    {plan && <details className="plan-record"><summary>查看候选计划与最终确认计划</summary>
      <div className="plan-record-grid">{([["候选计划", candidate], ["最终确认计划", plan]] as const).map(([title, record]) => {
        return <div key={title}><h4>{title}</h4>{record ? <><p>{record.objective}</p><p>{record.scope}</p><ol>{record.steps.map((step, index) => <li key={index}>{step.title}<small>{step.phase} · {step.action} · {step.target?.value ?? step.requestPath ?? "页面"}{step.value !== undefined ? ` · 预期 / 输入：${step.value}` : ""}</small></li>)}</ol><details><summary>完整计划</summary><pre>{JSON.stringify(record, null, 2)}</pre></details></> : <p>没有保存候选计划</p>}</div>;
      })}</div>
    </details>}
  </section>;
}

export function RegressionStatus({ run }: { run: ReproRun }) {
  const report = run.regression;
  return <div className="regression-status" role="status">
    <strong>{report?.status === "verified" ? "导出测试已验证" : report ? "导出测试验证未通过" : run.business?.testStatus === "generated" ? "导出测试已生成，尚未验证" : "测试草稿"}</strong>
    <p>{report?.summary ?? "内置示例修复验证完成后，将自动重跑同一份导出测试。其他页面需要自行运行测试。"}</p>
    {report && <><p>文件 SHA-256：<code>{report.testSha256 || "未生成"}</code></p>
      {report.results.map(item => <p key={item.version}>{item.version === "bug" ? "缺陷版" : "修复版"}：{item.detail} {item.reportUrl && <a href={item.reportUrl} target="_blank" rel="noreferrer">测试报告</a>}</p>)}
      {report.testUrl && <a href={report.testUrl} download="regression.spec.ts">下载已重跑的测试文件</a>}
    </>}
  </div>;
}
