import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Accessibility,
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Code2,
  Copy,
  Eye,
  FileCode2,
  GitFork,
  Globe2,
  Gauge,
  History,
  LayoutDashboard,
  LoaderCircle,
  Monitor,
  Play,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  SquareTerminal,
  TrendingUp,
  Wifi
} from "lucide-react";
import { api } from "./api";
import { GitHubImport } from "./GitHubImport";
import { GitHubSourceCard } from "./GitHubSourceCard";
import type { AppConfig, CreateRunInput, DeviceName, Finding, QualityTrendPoint, ReproRun, WebVitals } from "./types";
import { VerificationPanel } from "./VerificationPanel";
import { BusinessEvidence, PlanEditor, verdictLabels } from "./Business";
import type { ReproPlan } from "./types";

const defaultInput: CreateRunInput = {
  url: "",
  issue: "",
  expected: "",
  devices: ["desktop", "iphone13", "pixel7"]
};

const deviceLabels: Record<DeviceName, string> = {
  desktop: "Desktop",
  iphone13: "iPhone 13",
  pixel7: "Pixel 7"
};

const categoryLabels: Record<Finding["category"], string> = {
  functional: "功能",
  visual: "视觉",
  accessibility: "可访问性",
  performance: "性能",
  console: "控制台",
  network: "网络"
};

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function formatDuration(milliseconds = 0): string {
  if (milliseconds < 1000) return `${milliseconds}ms`;
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function Logo() {
  return (
    <div className="logo">
      <span className="logo-mark"><CircleDot size={20} /></span>
      <span>Repro<b>Lens</b></span>
    </div>
  );
}

type AppView = "dashboard" | "history";

function Shell({ children, activeView, onHome, onHistory, config }: { children: ReactNode; activeView: AppView; onHome: () => void; onHistory: () => void; config?: AppConfig }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Logo />
        <nav>
          <button className={`nav-item ${activeView === "dashboard" ? "active" : ""}`} aria-current={activeView === "dashboard" ? "page" : undefined} onClick={onHome}><LayoutDashboard size={18} /> 工作台</button>
          <button className={`nav-item ${activeView === "history" ? "active" : ""}`} aria-current={activeView === "history" ? "page" : undefined} onClick={onHistory}><History size={18} /> 运行记录</button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="agent-card">
          <div className="agent-card-title"><Bot size={16} /> Agent online</div>
          <p>受限浏览器动作 · 证据优先</p>
          <div className="provider-row">
            <span className="status-dot" />
            <span>{config?.provider === "deepseek" ? "DeepSeek" : "Fallback"}</span>
          </div>
        </div>
        <a className="github-link" href="https://github.com/liancheng2020/reprolens" target="_blank" rel="noreferrer"><GitFork size={18} /> GitHub <ArrowUpRight size={14} /></a>
      </aside>
      <main className="main-shell">{children}</main>
    </div>
  );
}

function RunList({ runs, onSelect }: { runs: ReproRun[]; onSelect: (run: ReproRun) => void }) {
  return (
    <div className="run-list">
      {runs.map((run) => (
        <button key={run.id} className="run-row" onClick={() => onSelect(run)}>
          <span className={`run-status ${run.status}`}><span /></span>
          <span className="run-info"><strong>{run.input.issue}</strong><small>{formatTime(run.createdAt)} · {run.metrics.testedDevices} devices</small></span>
          {run.status === "failed" ? <span className="mini-score bad">失败</span>
            : run.status === "running" || run.status === "queued" ? <LoaderCircle className="spin" size={17} aria-label={run.status === "queued" ? "排队中" : "运行中"} />
              : <span className={`business-badge ${run.business ? run.verdict : ""}`}>{run.business ? verdictLabels[run.verdict ?? "inconclusive"] : "旧版扫描"}</span>}
          <ChevronRight size={16} />
        </button>
      ))}
    </div>
  );
}

function Topbar({ title, subtitle, config }: { title: string; subtitle: string; config?: AppConfig }) {
  return (
    <header className="topbar">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="topbar-actions">
        <span className="live-chip"><Wifi size={14} /> API connected</span>
        <div className="avatar">LC</div>
      </div>
    </header>
  );
}

function Dashboard({
  retryRun,
  runs,
  config,
  onCreated,
  onSelect
}: {
  retryRun?: ReproRun;
  runs: ReproRun[];
  config?: AppConfig;
  onCreated: (run: ReproRun) => void;
  onSelect: (run: ReproRun) => void;
}) {
  const [input, setInput] = useState<CreateRunInput>(retryRun ? { ...retryRun.input, baselineRunId: undefined, plan: undefined, planConfirmed: false } : defaultInput);
  const [plan, setPlan] = useState<ReproPlan | undefined>(retryRun?.input.plan);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (config?.qualityGate) setInput((current) => ({ ...current, qualityGate: config.qualityGate }));
  }, [config?.qualityGate]);

  // Editing the original request invalidates its confirmed plan; remounting a retry does not.
  const changeRequest = (change: Partial<CreateRunInput>) => {
    setInput(current => ({ ...current, ...change })); setPlan(undefined); setConfirmed(false);
  };

  const toggleDevice = (device: DeviceName) => {
    setInput((current) => ({
      ...current,
      devices: current.devices.includes(device)
        ? current.devices.filter((item) => item !== device)
        : [...current.devices, device]
    }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!input.devices.length) {
      setError("至少选择一个测试设备");
      return;
    }
    setSubmitting(true);
    try {
      if (!plan) {
        setPlan(await api.createPlan(input));
        setConfirmed(false);
      } else {
        if (!confirmed) { setError("请核对并确认复现计划"); return; }
        const payload = { ...input, plan, planConfirmed: true };
        onCreated(retryRun ? await api.replanRun(retryRun.id, payload) : await api.createRun(payload));
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "创建任务失败");
    } finally {
      setSubmitting(false);
    }
  };

  const completed = runs.filter((run) => run.status === "completed");
  const reproduced = completed.filter((run) => run.business && run.verdict === "reproduced").length;
  const averageScore = completed.length
    ? Math.round(completed.reduce((total, run) => total + (run.score ?? 0), 0) / completed.length)
    : 0;

  return (
    <>
      <Topbar title="验证工作台" subtitle="把模糊的 Bug 报告变成可验证证据" config={config} />
      <div className="content">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><Sparkles size={15} /> Browser QA Agent</div>
            <h2>从一句问题描述，<br /><span>抵达可复现的真相。</span></h2>
            <p>明确复现目标，确认操作与业务检查项。ReproLens 操作真实浏览器，展示期望与实际结果，并生成回归测试。</p>
            <div className="hero-proof">
              <span><ShieldCheck size={17} /> 受限动作</span>
              <span><Eye size={17} /> 全程可见</span>
              <span><FileCode2 size={17} /> 测试可交付</span>
            </div>
          </div>
          <div className="orbit-visual" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit-core"><Bot size={34} /><span>agent</span></div>
            <div className="orbit-node node-a"><Globe2 size={18} /></div>
            <div className="orbit-node node-b"><Search size={18} /></div>
            <div className="orbit-node node-c"><Code2 size={18} /></div>
          </div>
        </section>

        <section className="stats-grid">
          <article className="stat-card"><div className="stat-icon lime"><Activity size={19} /></div><div><span>累计运行</span><strong>{runs.length}</strong></div><small>本地持久化</small></article>
          <article className="stat-card"><div className="stat-icon coral"><AlertTriangle size={19} /></div><div><span>成功复现</span><strong>{reproduced}</strong></div><small>证据驱动</small></article>
          <article className="stat-card"><div className="stat-icon blue"><ShieldCheck size={19} /></div><div><span>平均评分</span><strong>{averageScore || "—"}</strong></div><small>/ 100</small></article>
          <article className="stat-card"><div className="stat-icon purple"><Bot size={19} /></div><div><span>推理引擎</span><strong className="engine-name">{config?.provider === "deepseek" ? "DeepSeek" : "Rules"}</strong></div><small>{config?.model ?? "deterministic"}</small></article>
        </section>

        <GitHubImport config={config} onImported={onCreated} />

        <section className="workspace-grid">
          <form className="run-form panel" onSubmit={submit}>
            <div className="panel-heading">
              <div><span className="section-kicker">NEW RUN</span><h3>创建复现任务</h3></div>
            </div>
            <label>
              <span>目标页面</span>
              <div className="input-shell"><Globe2 size={17} /><input type="url" required value={input.url} onChange={(event) => changeRequest({ url: event.target.value })} placeholder="https://your-app.example.com" /></div>
            </label>
            <label>
              <span>问题描述</span>
              <textarea required rows={4} value={input.issue} onChange={(event) => changeRequest({ issue: event.target.value })} placeholder="描述操作步骤和实际遇到的问题" />
            </label>
            <label>
              <span>期望结果</span>
              <textarea required rows={3} value={input.expected} onChange={(event) => changeRequest({ expected: event.target.value })} placeholder="描述完成操作后应出现的结果" />
            </label>
            <fieldset>
              <legend>测试设备</legend>
              <div className="device-selector">
                {(["desktop", "iphone13", "pixel7"] as DeviceName[]).map((device) => (
                  <button type="button" key={device} className={input.devices.includes(device) ? "selected" : ""} onClick={() => toggleDevice(device)}>
                    {device === "desktop" ? <Monitor size={18} /> : <Smartphone size={18} />}
                    <span>{deviceLabels[device]}</span>
                    {input.devices.includes(device) && <Check size={14} />}
                  </button>
                ))}
              </div>
            </fieldset>
            {plan && <PlanEditor plan={plan} onChange={(next) => { setPlan(next); setConfirmed(false); }} />}
            {plan && <label className="plan-consent"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>我已核对目标页面、定位方式、测试数据和核心检查项；所有未覆盖的期望已在范围中明确排除。</span></label>}
            {plan && <button type="button" className="secondary-button" disabled={submitting} onClick={() => { setPlan(undefined); setConfirmed(false); }}>重新生成计划</button>}
            {error && <div className="form-error"><AlertTriangle size={15} /> {error}</div>}
            <button className="primary-button" disabled={submitting || Boolean(plan && !confirmed)}>
              {submitting ? <LoaderCircle className="spin" size={18} /> : <Play size={18} fill="currentColor" />}
              {submitting ? (plan ? "正在创建任务" : "正在生成复现计划") : plan ? "按确认计划执行" : "生成复现计划"}
              {!submitting && <ChevronRight size={17} />}
            </button>
          </form>

          <section className="recent panel">
            <div className="panel-heading"><div><span className="section-kicker">RECENT</span><h3>最近运行</h3></div><History size={19} /></div>
            {!runs.length ? (
              <div className="empty-state"><div><SquareTerminal size={28} /></div><strong>还没有运行记录</strong><p>填写左侧任务并启动复现后，即可在这里查看运行记录和证据。</p></div>
            ) : (
              <RunList runs={runs.slice(0, 7)} onSelect={onSelect} />
            )}
          </section>
        </section>
      </div>
    </>
  );
}

function QualityTrend({ trends }: { trends: QualityTrendPoint[] }) {
  const pages = useMemo(() => [...new Set(trends.map((item) => item.url))], [trends]);
  const [page, setPage] = useState("all");
  const filtered = page === "all" ? trends : trends.filter((item) => item.url === page);
  const recent = filtered.slice(-8);
  const categories = ["accessibility", "performance", "visual", "network", "console"] as const;
  const categoryTotals = categories.map((category) => ({
    category,
    count: filtered.reduce((total, item) => total + (item.categories[category] ?? 0), 0)
  }));
  const deviceAverages = (["desktop", "iphone13", "pixel7"] as DeviceName[]).map((device) => {
    const values = filtered.flatMap((item) => item.devices.filter((metric) => metric.device === device).map((metric) => metric.score));
    return { device, score: values.length ? Math.round(values.reduce((total, value) => total + value, 0) / values.length) : undefined };
  });

  return (
    <section className="quality-trend panel">
      <div className="panel-heading trend-heading">
        <div><span className="section-kicker">QUALITY TREND</span><h3>页面质量趋势</h3></div>
        <select value={page} onChange={(event) => setPage(event.target.value)} aria-label="筛选目标页面">
          <option value="all">全部页面</option>
          {pages.map((url) => <option key={url} value={url}>{url}</option>)}
        </select>
      </div>
      {!filtered.length ? (
        <div className="trend-empty"><TrendingUp size={24} /><span>完成 v0.4 质量扫描后，这里将展示评分趋势。</span></div>
      ) : (
        <div className="trend-layout">
          <div className="score-trend" aria-label="最近质量评分">
            {recent.map((item) => (
              <div className="trend-column" key={item.runId} title={`${new Date(item.createdAt).toLocaleString("zh-CN")} · ${item.score}`}>
                <span className={`trend-score ${item.gateStatus}`}>{item.score}</span>
                <i style={{ height: `${Math.max(12, item.score)}%` }} />
                <small>{new Date(item.createdAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</small>
              </div>
            ))}
          </div>
          <div className="trend-summary">
            <div className="category-totals">
              {categoryTotals.map((item) => <span key={item.category}><b>{categoryLabels[item.category]}</b>{item.count}</span>)}
            </div>
            <div className="device-averages">
              {deviceAverages.map((item) => <span key={item.device}><b>{deviceLabels[item.device]}</b>{item.score ?? "—"}</span>)}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function RunHistory({ runs, trends, config, onSelect }: { runs: ReproRun[]; trends: QualityTrendPoint[]; config?: AppConfig; onSelect: (run: ReproRun) => void }) {
  return (
    <>
      <Topbar title="运行记录" subtitle="查看历次复现任务及其证据结果" config={config} />
      <div className="content history-content">
        <QualityTrend trends={trends} />
        <section className="history-panel panel">
          <div className="panel-heading">
            <div><span className="section-kicker">RUN HISTORY</span><h3>全部运行</h3></div>
            <span className="event-count">{runs.length} RUNS</span>
          </div>
          {!runs.length ? (
            <div className="empty-state"><div><History size={28} /></div><strong>还没有运行记录</strong><p>在工作台创建一次复现任务后，运行结果会出现在这里。</p></div>
          ) : (
            <RunList runs={runs} onSelect={onSelect} />
          )}
        </section>
      </div>
    </>
  );
}

function ScoreRing({ score = 0 }: { score?: number }) {
  return (
    <div className="score-ring" style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}>
      <div><strong>{score}</strong><span>quality</span></div>
    </div>
  );
}

function formatVital(value: number | undefined, unit: string, digits = 0): string {
  return value === undefined ? "—" : `${value.toFixed(digits)}${unit}`;
}

function vitalRating(name: string, value: number | undefined): "good" | "warn" | "bad" | "unknown" {
  if (value === undefined) return "unknown";
  const limits: Record<string, [number, number]> = { LCP: [2500, 4000], CLS: [0.1, 0.25], INP: [200, 500], FCP: [1800, 3000], TTFB: [800, 1800] };
  const [good, poor] = limits[name] ?? [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  return value <= good ? "good" : value <= poor ? "warn" : "bad";
}

function QualityPanel({ run, activeDevice }: { run: ReproRun; activeDevice: DeviceName }) {
  const report = run.quality;
  const metrics = report?.devices.find((item) => item.device === activeDevice);
  const vitals: WebVitals | undefined = metrics?.vitals;
  const cards = [
    { name: "LCP", value: vitals?.lcpMs, display: formatVital(vitals?.lcpMs, "ms") },
    { name: "CLS", value: vitals?.cls, display: formatVital(vitals?.cls, "", 3) },
    { name: "INP", value: vitals?.inpMs, display: formatVital(vitals?.inpMs, "ms") },
    { name: "FCP", value: vitals?.fcpMs, display: formatVital(vitals?.fcpMs, "ms") },
    { name: "TTFB", value: vitals?.ttfbMs, display: formatVital(vitals?.ttfbMs, "ms") },
    { name: "TRANSFER", value: undefined, display: formatVital(vitals?.transferSizeKb, "KB", 1) }
  ];

  return (
    <section className="quality-panel panel">
      <div className="quality-heading">
        <div><span className="section-kicker">PAGE QUALITY</span><h3>页面质量报告</h3></div>
        <div className={`quality-gate ${report?.gate.status ?? "pending"}`}>
          {report?.gate.status === "failed" ? <AlertTriangle size={17} /> : <ShieldCheck size={17} />}
          <span>{report ? report.gate.status === "failed" ? "质量门禁未通过" : report.gate.status === "passed" ? "质量门禁已通过" : "质量门禁未启用" : "等待质量分析"}</span>
        </div>
      </div>
      {report?.gate.reasons.length ? <div className="gate-reasons">{report.gate.reasons.map((reason) => <span key={reason}>{reason}</span>)}</div> : null}
      <div className="quality-body">
        <div className="vital-grid">
          {cards.map((card) => (
            <div className={`vital-card ${vitalRating(card.name, card.value)}`} key={card.name}>
              <span>{card.name}</span><strong>{card.display}</strong>
            </div>
          ))}
        </div>
        <div className="quality-summary">
          <div><Gauge size={18} /><span>设备评分</span><strong>{metrics?.score ?? "—"}</strong></div>
          <div><Accessibility size={18} /><span>WCAG 问题</span><strong>{metrics?.accessibilityIssues ?? "—"}</strong></div>
          <div><Activity size={18} /><span>性能问题</span><strong>{metrics?.performanceIssues ?? "—"}</strong></div>
          <small>{deviceLabels[activeDevice]} · {vitals?.resourceCount ?? 0} resources · DOM ready {formatVital(vitals?.domContentLoadedMs, "ms")}</small>
        </div>
      </div>
    </section>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  return (
    <article className={`finding-card severity-${finding.severity}`}>
      <div className="finding-top">
        <div className="finding-icon">{finding.severity === "high" ? <AlertTriangle size={17} /> : <Eye size={17} />}</div>
        <div><span>{categoryLabels[finding.category]} · {deviceLabels[finding.device]}</span><h4>{finding.title}</h4></div>
        <span className="severity-label">{finding.severity}</span>
      </div>
      <p>{finding.description}</p>
      <div className="evidence"><span>Evidence</span>{finding.evidence}</div>
      {(finding.selector || finding.ruleId) && <div className="finding-location"><code>{finding.selector ?? finding.ruleId}</code>{finding.boundingBox && <span>{finding.boundingBox.width}×{finding.boundingBox.height} @ {finding.boundingBox.x},{finding.boundingBox.y}</span>}</div>}
      <div className="recommendation"><span>修复建议</span><p>{finding.recommendation}</p>{finding.helpUrl && <a href={finding.helpUrl} target="_blank" rel="noreferrer">规则说明 <ArrowUpRight size={12} /></a>}</div>
    </article>
  );
}

function RunDetail({ run, config, onBack, onRefresh, onVerify, onPublish, onReplan }: { run: ReproRun; config?: AppConfig; onBack: () => void; onRefresh: () => void; onVerify: (url: string) => Promise<void>; onPublish: () => Promise<void>; onReplan: () => void }) {
  const [activeDevice, setActiveDevice] = useState<DeviceName>(run.screenshots[0]?.device ?? run.input.devices[0]);
  const [copied, setCopied] = useState(false);
  const screenshot = run.screenshots.find((item) => item.device === activeDevice) ?? run.screenshots.at(-1);
  const isRunning = run.status === "running" || run.status === "queued";

  useEffect(() => {
    if (!run.screenshots.some((item) => item.device === activeDevice) && run.screenshots[0]) setActiveDevice(run.screenshots[0].device);
  }, [run.screenshots, activeDevice]);

  const copyCode = async () => {
    if (!run.generatedTest) return;
    await navigator.clipboard.writeText(run.generatedTest);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <>
      <header className="topbar run-topbar">
        <div className="run-title-row">
          <button className="icon-button" onClick={onBack}><ArrowLeft size={19} /></button>
          <div><h1>运行详情</h1><p>RUN / {run.id.slice(0, 8).toUpperCase()}</p></div>
        </div>
        <div className="topbar-actions">
          <span className={`run-live ${isRunning ? "active" : ""}`}><Radio size={14} /> {isRunning ? "LIVE RUNNING" : run.status.toUpperCase()}</span>
          <button className="secondary-button" onClick={onRefresh}><RefreshCw size={15} /> 刷新</button>
        </div>
      </header>
      <div className="content run-content">
        <section className="run-overview panel">
          <div className="overview-main">
            <div className={`verdict-icon ${run.verdict ?? "running"}`}>
              {isRunning ? <LoaderCircle className="spin" size={25} /> : run.verdict === "reproduced" ? <AlertTriangle size={25} /> : <CheckCircle2 size={25} />}
            </div>
            <div><span className="section-kicker">{isRunning ? "AGENT IS WORKING" : "BUSINESS VERIFICATION"}</span><h2>{isRunning ? run.currentStep : run.status === "failed" ? "执行失败" : run.business ? verdictLabels[run.verdict ?? "inconclusive"] : "旧版页面质量扫描"}</h2><p>{run.error ?? run.summary ?? run.input.issue}</p></div>
          </div>
          <div className="overview-meta">
            <div><span>核心覆盖</span><strong>{run.business ? `${run.business.covered}/${run.business.total}` : "旧版"}</strong></div>
            <div><span>耗时</span><strong>{formatDuration(run.metrics.durationMs)}</strong></div>
            <div><span>引擎</span><strong>{run.provider === "deepseek" ? "DeepSeek" : "Rules"}</strong></div>
          </div>
          {!isRunning && <button className="secondary-button" onClick={onReplan}>编辑计划并重新复现</button>}
        </section>

        <GitHubSourceCard run={run} canPublish={Boolean(config?.github.configured)} onPublish={onPublish} />

        <VerificationPanel run={run} activeDevice={activeDevice} onVerify={onVerify} />

        <BusinessEvidence report={run.business} />

        <section className="inspect-grid">
          <div className="browser-panel panel">
            <div className="browser-toolbar">
              <div className="traffic"><i /><i /><i /></div>
              <div className="address"><ShieldCheck size={13} /><span>{run.input.url}</span></div>
              <span className="viewport-label">{screenshot ? `${screenshot.viewport.width} × ${screenshot.viewport.height}` : "capturing"}</span>
            </div>
            <div className="device-tabs">
              {run.input.devices.map((device) => (
                <button key={device} className={activeDevice === device ? "active" : ""} onClick={() => setActiveDevice(device)}>
                  {device === "desktop" ? <Monitor size={15} /> : <Smartphone size={15} />}{deviceLabels[device]}
                  {run.screenshots.some((item) => item.device === device) && <CheckCircle2 size={13} />}
                </button>
              ))}
            </div>
            <div className="browser-canvas">
              {screenshot ? (
                <div className="screenshot-wrap">
                  <img src={screenshot.url} alt={`${deviceLabels[screenshot.device]} evidence`} />
                  {!!run.findings.filter((item) => item.device === screenshot.device).length && (
                    <span className="evidence-pin"><AlertTriangle size={14} /> {run.findings.filter((item) => item.device === screenshot.device).length} issues</span>
                  )}
                </div>
              ) : (
                <div className="browser-loading"><div className="scan-line" /><Bot size={34} /><strong>Agent 正在观察页面</strong><span>{run.currentStep}</span></div>
              )}
            </div>
          </div>

          <div className="timeline-panel panel">
            <div className="panel-heading"><div><span className="section-kicker">LIVE TRACE</span><h3>Agent 时间线</h3></div><span className="event-count">{run.timeline.length} events</span></div>
            <div className="timeline">
              {run.timeline.map((item, index) => (
                <div className={`timeline-item ${item.state}`} key={item.id}>
                  <div className="timeline-rail"><span>{item.state === "error" ? <AlertTriangle size={12} /> : <Check size={12} />}</span>{index < run.timeline.length - 1 && <i />}</div>
                  <div><time>{formatTime(item.at)}</time><strong>{item.title}</strong>{item.detail && <p>{item.detail}</p>}</div>
                </div>
              ))}
              {isRunning && <div className="timeline-pending"><LoaderCircle className="spin" size={16} />等待下一条证据...</div>}
            </div>
          </div>
        </section>

        <section className="result-grid">
          <div className="findings-panel panel">
            <div className="panel-heading"><div><span className="section-kicker">ADDITIONAL QUALITY</span><h3>附加页面质量问题（不代表目标 Bug）</h3></div><span className="finding-count">{run.findings.length}</span></div>
            {run.findings.length ? <div className="finding-list">{run.findings.map((finding) => <FindingCard key={finding.id} finding={finding} />)}</div> : <div className="empty-mini"><Eye size={24} /><span>暂无附加质量发现</span></div>}
          </div>

          <div className="code-panel panel">
            <div className="panel-heading"><div><span className="section-kicker">DELIVERABLE</span><h3>回归测试</h3></div>{run.generatedTest && <button className="copy-button" onClick={copyCode}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "已复制" : "复制"}</button>}</div>
            {run.generatedTest ? (
              <><p className="plan-help">{run.business?.testStatus === "generated" ? "已按计划生成，尚未自动重跑验证" : "测试草稿 / 旧版测试，尚不能证明目标问题"}。故障版应失败，修复版应通过。</p><pre><code>{run.generatedTest}</code></pre></>
            ) : (
              <div className="code-placeholder"><FileCode2 size={28} /><strong>等待测试生成</strong><span>完成复现后，Agent 将交付可执行的 Playwright 测试。</span></div>
            )}
          </div>
        </section>

        <details className="quality-disclosure panel"><summary>附加页面质量报告 · 与业务复现独立</summary><QualityPanel run={run} activeDevice={activeDevice} /></details>
        <section className="metrics-strip panel">
          <div><Monitor size={18} /><span>设备</span><strong>{run.metrics.testedDevices}</strong></div>
          <div><SquareTerminal size={18} /><span>Console errors</span><strong>{run.metrics.consoleErrors}</strong></div>
          <div><Globe2 size={18} /><span>Network errors</span><strong>{run.metrics.networkErrors}</strong></div>
          <div><Eye size={18} /><span>A11y issues</span><strong>{run.metrics.accessibilityIssues}</strong></div>
          <div><Gauge size={18} /><span>Performance</span><strong>{run.metrics.performanceIssues ?? 0}</strong></div>
          <div><Clock3 size={18} /><span>Duration</span><strong>{formatDuration(run.metrics.durationMs)}</strong></div>
        </section>
      </div>
    </>
  );
}

export default function App() {
  const [retryRun, setRetryRun] = useState<ReproRun>();
  const [config, setConfig] = useState<AppConfig>();
  const [runs, setRuns] = useState<ReproRun[]>([]);
  const [trends, setTrends] = useState<QualityTrendPoint[]>([]);
  const [selected, setSelected] = useState<ReproRun>();
  const [view, setView] = useState<AppView>("dashboard");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [nextConfig, nextRuns, nextTrends] = await Promise.all([api.config(), api.runs(), api.qualityTrends()]);
      setConfig(nextConfig);
      setRuns(nextRuns);
      setTrends(nextTrends);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "无法连接 ReproLens API");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!selected || !["queued", "running"].includes(selected.status)) return;
    return api.subscribe(
      selected.id,
      (run) => {
        setSelected(run);
        setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)]);
      },
      () => void api.run(selected.id).then(setSelected).catch(() => undefined)
    );
  }, [selected?.id, selected?.status]);
  useEffect(() => {
    if (selected?.status === "completed") void api.qualityTrends().then(setTrends).catch(() => undefined);
  }, [selected?.id, selected?.status]);

  const sortedRuns = useMemo(() => [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [runs]);

  if (loading) return <div className="splash"><Logo /><LoaderCircle className="spin" size={24} /><span>正在连接 ReproLens...</span></div>;
  if (loadError) return <div className="splash"><Logo /><AlertTriangle size={24} /><strong>API 连接失败</strong><span>{loadError}</span><button className="secondary-button" onClick={() => void load()}><RefreshCw size={15} />重新连接</button></div>;

  return (
    <Shell
      activeView={view}
      onHome={() => { setView("dashboard"); setSelected(undefined); setRetryRun(undefined); }}
      onHistory={() => { setView("history"); setSelected(undefined); void api.qualityTrends().then(setTrends).catch(() => undefined); }}
      config={config}
    >
      {selected ? (
        <RunDetail
          run={selected}
          onReplan={() => { setRetryRun(selected); setSelected(undefined); setView("dashboard"); }}
          config={config}
          onBack={() => setSelected(undefined)}
          onRefresh={() => void api.run(selected.id).then(setSelected)}
          onVerify={async (url) => {
            const next = await api.verifyRun(selected.id, url);
            setRuns((current) => [next, ...current.filter((item) => item.id !== next.id)]);
            setSelected(next);
          }}
          onPublish={async () => {
            const next = await api.publishGitHubRun(selected.id);
            setRuns((current) => [next, ...current.filter((item) => item.id !== next.id)]);
            setSelected(next);
          }}
        />
      ) : view === "history" ? (
        <RunHistory runs={sortedRuns} trends={trends} config={config} onSelect={setSelected} />
      ) : (
        <Dashboard
          retryRun={retryRun}
          runs={sortedRuns}
          config={config}
          onCreated={(run) => { setRuns((current) => [run, ...current]); setSelected(run); }}
          onSelect={setSelected}
        />
      )}
    </Shell>
  );
}
