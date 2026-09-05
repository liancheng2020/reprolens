import { randomUUID } from "node:crypto";
import type { AuditSnapshot, Finding, Severity } from "./types.js";

function axeSeverity(impact: NonNullable<AuditSnapshot["axeViolations"]>[number]["impact"]): Severity {
  if (impact === "critical" || impact === "serious") return "high";
  if (impact === "moderate") return "medium";
  return "low";
}

function performanceSeverity(value: number, needsImprovement: number, poor: number): Severity | undefined {
  if (value > poor) return "high";
  if (value > needsImprovement) return "medium";
  return undefined;
}

export function buildFindings(audit: AuditSnapshot): Finding[] {
  const findings: Finding[] = [];
  const add = (finding: Omit<Finding, "id" | "device">) => {
    findings.push({ id: randomUUID(), device: audit.device, ...finding });
  };

  for (const violation of audit.axeViolations ?? []) {
    const first = violation.nodes[0];
    add({
      category: "accessibility",
      severity: axeSeverity(violation.impact),
      title: violation.help,
      description: violation.description,
      evidence: [first?.target.join(" "), first?.failureSummary].filter(Boolean).join(" · ").slice(0, 500),
      recommendation: first?.failureSummary?.replace(/^Fix (any|all) of the following:\s*/i, "") ?? violation.help,
      selector: first?.target.join(" "),
      boundingBox: first?.box,
      ruleId: violation.id,
      helpUrl: violation.helpUrl
    });
  }

  if (audit.horizontalOverflow > 1) {
    add({
      category: "visual",
      severity: "high",
      title: "页面存在横向溢出",
      description: `内容宽度超出当前视口 ${audit.horizontalOverflow}px，移动端用户需要横向滚动。`,
      evidence: `${audit.viewport.width}×${audit.viewport.height} 视口下 document.scrollWidth 超出 viewport。`,
      recommendation: "检查固定宽度、min-width 和绝对定位元素，改用响应式网格或 max-width。"
    });
  }

  if (audit.missingAlt.length && !(audit.axeViolations ?? []).some((item) => item.id === "image-alt")) {
    const first = audit.missingAlt[0];
    add({
      category: "accessibility",
      severity: "medium",
      title: `${audit.missingAlt.length} 张图片缺少替代文本`,
      description: "图片没有 alt 属性，读屏用户无法理解图片内容。",
      evidence: first.selector,
      recommendation: "为信息型图片提供准确 alt；装饰图片使用空 alt。",
      selector: first.selector,
      boundingBox: first.box
    });
  }

  if (audit.unlabeledControls.length && !(audit.axeViolations ?? []).some((item) => ["button-name", "label", "select-name", "aria-input-field-name"].includes(item.id))) {
    const first = audit.unlabeledControls[0];
    add({
      category: "accessibility",
      severity: "medium",
      title: `${audit.unlabeledControls.length} 个控件缺少可访问名称`,
      description: "图标按钮或输入控件没有文本、label 或 aria-label。",
      evidence: first.selector,
      recommendation: "补充可见标签或 aria-label，并使用语义化控件。",
      selector: first.selector,
      boundingBox: first.box
    });
  }

  if (audit.clippedElements.length) {
    const first = audit.clippedElements[0];
    add({
      category: "visual",
      severity: "medium",
      title: `${audit.clippedElements.length} 个元素可能发生内容裁切`,
      description: "元素的滚动尺寸大于可见尺寸，内容可能被 overflow 规则截断。",
      evidence: first.selector,
      recommendation: "检查固定高度、white-space 和 overflow 设置。",
      selector: first.selector,
      boundingBox: first.box
    });
  }

  if (audit.consoleErrors.length || audit.pageErrors.length) {
    const messages = [...audit.pageErrors, ...audit.consoleErrors];
    add({
      category: "console",
      severity: "high",
      title: "用户操作触发浏览器错误",
      description: messages[0]?.slice(0, 220) || "浏览器控制台出现错误。",
      evidence: `共捕获 ${messages.length} 条错误`,
      recommendation: "根据操作时间线定位触发错误的事件处理器，并补充异常状态展示。"
    });
  }

  if (audit.networkErrors.length) {
    const first = audit.networkErrors[0];
    add({
      category: "network",
      severity: "high",
      title: "关键操作出现失败请求",
      description: `${first.status} ${first.url}`,
      evidence: `共捕获 ${audit.networkErrors.length} 个 HTTP 4xx/5xx 响应`,
      recommendation: "检查接口响应与前端错误分支，确保失败时提供明确反馈。"
    });
  }

  const vitals = audit.vitals;
  if (vitals) {
    const performanceChecks = [
      { key: "LCP", value: vitals.lcpMs, improve: 2500, poor: 4000, unit: "ms", recommendation: "压缩首屏关键资源、预加载主视觉并缩短关键渲染路径。" },
      { key: "CLS", value: vitals.cls, improve: 0.1, poor: 0.25, unit: "", recommendation: "为图片和动态区域预留尺寸，避免加载后插入内容导致布局偏移。" },
      { key: "INP", value: vitals.inpMs, improve: 200, poor: 500, unit: "ms", recommendation: "拆分长任务并减少主线程阻塞，优先响应用户交互。" },
      { key: "FCP", value: vitals.fcpMs, improve: 1800, poor: 3000, unit: "ms", recommendation: "减少阻塞渲染的 CSS/脚本，优化首屏字体和关键资源加载。" },
      { key: "TTFB", value: vitals.ttfbMs, improve: 800, poor: 1800, unit: "ms", recommendation: "检查服务端处理、缓存策略和网络链路，缩短首字节时间。" }
    ] as const;

    for (const check of performanceChecks) {
      if (check.value === undefined) continue;
      const severity = performanceSeverity(check.value, check.improve, check.poor);
      if (!severity) continue;
      add({
        category: "performance",
        severity,
        title: `${check.key} 超出推荐阈值`,
        description: `${check.key} 实测 ${check.value}${check.unit}，推荐不超过 ${check.improve}${check.unit}。`,
        evidence: `${audit.device} · ${audit.viewport.width}×${audit.viewport.height}`,
        recommendation: check.recommendation,
        ruleId: check.key.toLowerCase()
      });
    }
  }

  return findings;
}

export function calculateScore(findings: Finding[]): number {
  const penalties: Record<Severity, number> = { high: 18, medium: 8, low: 3 };
  const uniqueRootCauses = new Map<string, Finding>();
  for (const finding of findings) {
    uniqueRootCauses.set(finding.category + finding.title, finding);
  }
  return Math.max(0, 100 - [...uniqueRootCauses.values()].reduce(
    (total, finding) => total + penalties[finding.severity],
    0
  ));
}

export function calculateConfidence(findings: Finding[]): number {
  const hasRuntimeFailure = findings.some((item) => item.category === "network" || item.category === "console");
  const hasVisualEvidence = findings.some((item) => item.category === "visual");
  if (hasRuntimeFailure && hasVisualEvidence) return 94;
  if (hasRuntimeFailure) return 88;
  if (findings.length) return 76;
  return 62;
}
