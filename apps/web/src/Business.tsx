import type { BusinessReport, ReproPlan, ReproStep, ReproTarget } from "./types";
import "./business.css";

export const verdictLabels = { reproduced: "已复现", not_reproduced: "此路径未复现", inconclusive: "证据不足" };
const actions = { click: "点击", input: "键盘输入并验证", assert: "检查结果", reload: "刷新页面" };
const assertions = { value: "输入值相等", text: "文本相等", visible: "可见", hidden: "隐藏 / 消失", enabled: "可用", editable: "可编辑", url: "URL 相等", response: "关联请求" };
const states = { passed: "通过", failed: "失败", blocked: "受阻", skipped: "跳过" };
const emptyStep = (): ReproStep => ({ title: "新的检查项", action: "assert", phase: "check", assertion: "visible", target: { by: "label", value: "" }, allowSideEffect: false });

export function PlanEditor({ plan, onChange }: { plan: ReproPlan; onChange: (plan: ReproPlan) => void }) {
  const update = (index: number, change: Partial<ReproStep>) => onChange({ ...plan, steps: plan.steps.map((s, i) => i === index ? { ...s, ...change } : s) });
  const target = (index: number, change: Partial<ReproTarget>) => update(index, { target: { by: "label", value: "", ...plan.steps[index].target, ...change } });
  return <section className="plan-editor">
    <div className="panel-heading"><div><span className="section-kicker">REPRODUCTION PLAN · v0.5</span><h3>确认要测的场景与结果</h3></div></div>
    <label><span>复现目标</span><textarea rows={2} value={plan.objective} onChange={e => onChange({ ...plan, objective: e.target.value })} /></label>
    <label><span>验收范围（不在此范围内的结果不会被证明）</span><textarea rows={2} value={plan.scope} onChange={e => onChange({ ...plan, scope: e.target.value })} /></label>
    {plan.warnings.map((warning, i) => <p className="plan-warning" key={i}>{warning}</p>)}
    <p className="plan-help">定位值需与页面名称完全一致；CSS 为高级选项。匹配多个控件时会停止，不会猜测。请使用合成测试数据，不要填写密码或真实个人信息。</p>
    {plan.steps.map((step, index) => <article className="plan-step" key={index}>
      <div className="plan-step-heading"><b>步骤 {index + 1}</b><div>
        <button type="button" disabled={index === 0} onClick={() => { const steps = [...plan.steps]; [steps[index - 1], steps[index]] = [steps[index], steps[index - 1]]; onChange({ ...plan, steps }); }}>上移</button>
        <button type="button" onClick={() => onChange({ ...plan, steps: plan.steps.filter((_, i) => i !== index) })}>删除</button>
      </div></div>
      <label><span>步骤目的</span><input required value={step.title} onChange={e => update(index, { title: e.target.value })} /></label>
      <div className="plan-fields">
        <label><span>操作</span><select value={step.action} onChange={e => {
          const action = e.target.value as ReproStep["action"];
          update(index, { action, phase: ["click", "reload"].includes(action) ? "setup" : step.phase,
            assertion: action === "assert" ? "visible" : undefined, value: action === "input" ? "" : undefined,
            target: action === "reload" ? undefined : step.target ?? { by: "label", value: "" } });
        }}>{Object.entries(actions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>作用</span><select value={step.phase} onChange={e => update(index, { phase: e.target.value as ReproStep["phase"] })}><option value="setup">前置准备（受阻不判 Bug）</option>{["input", "assert"].includes(step.action) && <option value="check">核心检查（决定业务结论）</option>}</select></label>
      </div>
      {step.action === "assert" && <label><span>检查类型</span><select value={step.assertion} onChange={e => update(index, { assertion: e.target.value as ReproStep["assertion"], target: ["url", "response"].includes(e.target.value) ? undefined : step.target ?? { by: "label", value: "" }, value: "", method: e.target.value === "response" ? "GET" : undefined, statusCode: e.target.value === "response" ? 200 : undefined, requestPath: undefined, responseField: undefined })}>{Object.entries(assertions).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>}
      {step.action !== "reload" && !["url", "response"].includes(step.assertion ?? "") && <div className="plan-fields">
        <label><span>定位方式</span><select value={step.target?.by ?? "label"} onChange={e => target(index, { by: e.target.value as ReproTarget["by"], role: "button" })}>
          <option value="label">表单标签</option><option value="placeholder">输入提示</option><option value="text">可见文本</option><option value="role">角色 + 名称</option><option value="css">CSS 选择器</option>
        </select></label>
        <label><span>准确名称 / 选择器</span><input required value={step.target?.value ?? ""} onChange={e => target(index, { value: e.target.value })} placeholder="例如：手机号" /></label>
        {step.target?.by === "role" && <label><span>角色</span><select value={step.target.role ?? "button"} onChange={e => target(index, { role: e.target.value as ReproTarget["role"] })}>{["button", "link", "tab", "textbox", "checkbox", "heading"].map(role => <option key={role}>{role}</option>)}</select></label>}
      </div>}
      {(step.action === "input" || ["value", "text", "url", "response"].includes(step.assertion ?? "")) && <label><span>{step.action === "input" ? "测试输入值（输入并失焦后应保留）" : "期望值（URL 支持相对路径；响应字段可选）"}</span><input value={step.value ?? ""} onChange={e => update(index, { value: e.target.value })} /></label>}
      {step.assertion === "response" && <div className="plan-fields">
        <label><span>同站请求路径（不含查询参数）</span><input required placeholder="/api/cart" value={step.requestPath ?? ""} onChange={e => update(index, { requestPath: e.target.value })} /></label>
        <label><span>请求方法</span><select value={step.method ?? "GET"} onChange={e => update(index, { method: e.target.value as ReproStep["method"] })}>{["GET", "POST", "PUT", "PATCH", "DELETE"].map(m => <option key={m}>{m}</option>)}</select></label>
        <label><span>期望状态码</span><input type="number" min={100} max={599} value={step.statusCode ?? 200} onChange={e => update(index, { statusCode: Number(e.target.value) })} /></label>
        <label><span>响应字段（可选，例 count）</span><input value={step.responseField ?? ""} onChange={e => update(index, { responseField: e.target.value || undefined })} /></label>
      </div>}
      {step.action === "click" && <label className="plan-consent"><input type="checkbox" checked={step.allowSideEffect} onChange={e => update(index, { allowSideEffect: e.target.checked })} /><span>此步骤可能提交或修改数据，我确认目标为已授权的测试环境</span></label>}
    </article>)}
    <button type="button" className="secondary-button" disabled={plan.steps.length >= 15} onClick={() => onChange({ ...plan, steps: [...plan.steps, emptyStep()] })}>添加步骤 / 检查项</button>
  </section>;
}

export function BusinessEvidence({ report }: { report?: BusinessReport }) {
  if (!report) return <section className="business-panel panel"><h3>旧版质量扫描记录</h3><p>此记录没有 v0.5 业务断言，不能据此证明目标 Bug。请重新生成复现计划。</p></section>;
  return <section className="business-panel panel">
    <div className="panel-heading"><div><span className="section-kicker">BUSINESS EVIDENCE</span><h3>目标问题 · 步骤证据</h3></div><span>核心覆盖 {report.covered}/{report.total}</span></div>
    <div className="business-devices">{report.devices.map(item => <span className={"business-badge " + item.verdict} key={item.device}>{item.device} · {verdictLabels[item.verdict]}</span>)}</div>
    {!report.steps.length && <p>尚无业务步骤证据。未确认计划的任务不会自动探索页面。</p>}
    {report.steps.map(step => <details className={"business-step " + step.status} key={step.device + step.index} open={step.status === "failed" || step.status === "blocked"}>
      <summary><span>{step.device} · {step.index + 1}. {step.title}</span><b>{states[step.status]}</b></summary>
      <dl><dt>作用</dt><dd>{step.phase === "check" ? "核心检查" : "前置准备"}</dd><dt>期望</dt><dd>{step.expected}</dd><dt>实际</dt><dd>{step.actual}</dd>
        {step.target && <><dt>目标</dt><dd>{step.target.by} · {step.target.value}</dd></>}
        {step.detail && <><dt>说明</dt><dd><pre>{step.detail}</pre></dd></>}
      </dl>
      <div className="business-shots">{[["操作前", step.beforeUrl], ["操作后", step.afterUrl]].map(([label, url]) => url && <a key={label} href={url} target="_blank" rel="noreferrer"><span>{label}</span><img src={url} alt={label + "证据"} loading="lazy" /></a>)}</div>
    </details>)}
    <p className="plan-help">复现结论只来自已确认的核心检查。执行受阻不等于产品 Bug；附加质量问题不参与判定。</p>
  </section>;
}
