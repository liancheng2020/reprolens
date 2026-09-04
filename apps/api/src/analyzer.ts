import { randomUUID } from "node:crypto";
import type { AuditSnapshot, Finding, Severity } from "./types.js";

export function buildFindings(audit: AuditSnapshot): Finding[] {
  const findings: Finding[] = [];
  const add = (finding: Omit<Finding, "id" | "device">) => {
    findings.push({ id: randomUUID(), device: audit.device, ...finding });
  };

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

  if (audit.missingAlt.length) {
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

  if (audit.unlabeledControls.length) {
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
