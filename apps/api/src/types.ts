export type RunStatus = "queued" | "running" | "completed" | "failed";
export type DeviceName = "desktop" | "iphone13" | "pixel7";
export type Severity = "high" | "medium" | "low";
export type FindingCategory = "functional" | "visual" | "accessibility" | "performance" | "console" | "network";
export type VerificationStatus = "improved" | "regressed" | "changed" | "unchanged";
export type GitHubPublishStatus = "pending" | "publishing" | "published" | "failed";

export interface GitHubRunSource {
  type: "github";
  repository: string;
  issueNumber: number;
  issueUrl: string;
  issueTitle: string;
  headSha: string;
  trigger: "manual" | "label" | "action";
  publishStatus: GitHubPublishStatus;
  checkRunId?: number;
  checkUrl?: string;
  commentId?: number;
  publishedAt?: string;
  publishError?: string;
}

export interface CreateRunInput {
  url: string;
  issue: string;
  expected: string;
  devices: DeviceName[];
  baselineRunId?: string;
  qualityGate?: QualityGateConfig;
}

export interface QualityGateConfig {
  enabled: boolean;
  minScore: number;
  maxHighSeverityFindings: number;
  maxAccessibilityIssues: number;
  maxPerformanceIssues: number;
}

export interface QualityGateResult {
  status: "passed" | "failed" | "disabled";
  thresholds: QualityGateConfig;
  reasons: string[];
}

export interface WebVitals {
  lcpMs?: number;
  cls?: number;
  inpMs?: number;
  fcpMs?: number;
  ttfbMs?: number;
  domContentLoadedMs?: number;
  loadMs?: number;
  resourceCount: number;
  transferSizeKb: number;
}

export interface DeviceQualityMetrics {
  device: DeviceName;
  score: number;
  accessibilityIssues: number;
  performanceIssues: number;
  vitals: WebVitals;
}

export interface QualityReport {
  gate: QualityGateResult;
  devices: DeviceQualityMetrics[];
  categoryCounts: Record<FindingCategory, number>;
}

export interface TimelineItem {
  id: string;
  at: string;
  type: "status" | "step" | "screenshot" | "finding" | "comparison" | "complete" | "error";
  title: string;
  detail?: string;
  state: "pending" | "running" | "success" | "warning" | "error";
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Finding {
  id: string;
  category: FindingCategory;
  severity: Severity;
  title: string;
  description: string;
  evidence: string;
  recommendation: string;
  device: DeviceName;
  selector?: string;
  boundingBox?: BoundingBox;
  ruleId?: string;
  helpUrl?: string;
}

export interface ScreenshotArtifact {
  id: string;
  label: string;
  device: DeviceName;
  viewport: { width: number; height: number };
  url: string;
}

export interface VisualComparison {
  id: string;
  device: DeviceName;
  baselineUrl: string;
  currentUrl: string;
  diffUrl: string;
  width: number;
  height: number;
  mismatchPixels: number;
  mismatchRatio: number;
}

export interface VerificationResult {
  baselineRunId: string;
  status: VerificationStatus;
  scoreDelta: number;
  resolvedFindings: number;
  introducedFindings: number;
  summary: string;
  comparisons: VisualComparison[];
}

export interface RunMetrics {
  durationMs: number;
  consoleErrors: number;
  networkErrors: number;
  accessibilityIssues: number;
  performanceIssues?: number;
  testedDevices: number;
}

export interface ReproRun {
  id: string;
  createdAt: string;
  completedAt?: string;
  status: RunStatus;
  currentStep: string;
  input: CreateRunInput;
  provider: "deepseek" | "deterministic";
  model?: string;
  score?: number;
  verdict?: "reproduced" | "not_reproduced" | "inconclusive";
  confidence?: number;
  summary?: string;
  timeline: TimelineItem[];
  findings: Finding[];
  screenshots: ScreenshotArtifact[];
  verification?: VerificationResult;
  generatedTest?: string;
  metrics: RunMetrics;
  quality?: QualityReport;
  source?: GitHubRunSource;
  error?: string;
}

export interface InteractiveElement {
  id: string;
  tag: string;
  type: string;
  text: string;
  label: string;
  placeholder: string;
}

export interface AgentAction {
  type: "click" | "fill" | "wait";
  targetId?: string;
  value?: string;
  reason: string;
}

export interface AuditSnapshot {
  device: DeviceName;
  viewport: { width: number; height: number };
  horizontalOverflow: number;
  missingAlt: Array<{ selector: string; box?: BoundingBox }>;
  unlabeledControls: Array<{ selector: string; box?: BoundingBox }>;
  clippedElements: Array<{ selector: string; box?: BoundingBox }>;
  consoleErrors: string[];
  networkErrors: Array<{ url: string; status: number }>;
  pageErrors: string[];
  axeViolations?: AxeViolation[];
  vitals?: WebVitals;
}

export interface AxeViolation {
  id: string;
  impact: "minor" | "moderate" | "serious" | "critical" | null;
  help: string;
  helpUrl: string;
  description: string;
  nodes: Array<{
    target: string[];
    html: string;
    failureSummary?: string;
    box?: BoundingBox;
  }>;
}

export interface QualityTrendPoint {
  runId: string;
  createdAt: string;
  url: string;
  score: number;
  gateStatus: QualityGateResult["status"];
  categories: Record<FindingCategory, number>;
  devices: DeviceQualityMetrics[];
}
