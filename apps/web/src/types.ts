export type RunStatus = "queued" | "running" | "completed" | "failed";
export type DeviceName = "desktop" | "iphone13" | "pixel7";
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

export interface QualityGateResult {
  status: "passed" | "failed" | "disabled";
  thresholds: QualityGateConfig;
  reasons: string[];
}

export interface QualityReport {
  gate: QualityGateResult;
  devices: DeviceQualityMetrics[];
  categoryCounts: Record<Finding["category"], number>;
}

export interface TimelineItem {
  id: string;
  at: string;
  type: "status" | "step" | "screenshot" | "finding" | "comparison" | "complete" | "error";
  title: string;
  detail?: string;
  state: "pending" | "running" | "success" | "warning" | "error";
}

export interface Finding {
  id: string;
  category: "functional" | "visual" | "accessibility" | "performance" | "console" | "network";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  evidence: string;
  recommendation: string;
  device: DeviceName;
  selector?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
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
  metrics: {
    durationMs: number;
    consoleErrors: number;
    networkErrors: number;
    accessibilityIssues: number;
    performanceIssues?: number;
    testedDevices: number;
  };
  quality?: QualityReport;
  source?: GitHubRunSource;
  error?: string;
}

export interface AppConfig {
  provider: "deepseek" | "deterministic";
  model: string | null;
  demoUrl: string;
  qualityGate: QualityGateConfig;
  github: {
    configured: boolean;
    triggerLabel: string;
    webhookConfigured: boolean;
  };
}

export interface QualityTrendPoint {
  runId: string;
  createdAt: string;
  url: string;
  score: number;
  gateStatus: QualityGateResult["status"];
  categories: Record<Finding["category"], number>;
  devices: DeviceQualityMetrics[];
}
