export type RunStatus = "queued" | "running" | "completed" | "failed";
export type DeviceName = "desktop" | "iphone13" | "pixel7";
export type Severity = "high" | "medium" | "low";
export type FindingCategory = "functional" | "visual" | "accessibility" | "console" | "network";
export type VerificationStatus = "improved" | "regressed" | "changed" | "unchanged";

export interface CreateRunInput {
  url: string;
  issue: string;
  expected: string;
  devices: DeviceName[];
  baselineRunId?: string;
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
}
