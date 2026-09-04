export type RunStatus = "queued" | "running" | "completed" | "failed";
export type DeviceName = "desktop" | "iphone13" | "pixel7";

export interface CreateRunInput {
  url: string;
  issue: string;
  expected: string;
  devices: DeviceName[];
}

export interface TimelineItem {
  id: string;
  at: string;
  type: "status" | "step" | "screenshot" | "finding" | "complete" | "error";
  title: string;
  detail?: string;
  state: "pending" | "running" | "success" | "warning" | "error";
}

export interface Finding {
  id: string;
  category: "functional" | "visual" | "accessibility" | "console" | "network";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  evidence: string;
  recommendation: string;
  device: DeviceName;
  selector?: string;
}

export interface ScreenshotArtifact {
  id: string;
  label: string;
  device: DeviceName;
  viewport: { width: number; height: number };
  url: string;
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
  generatedTest?: string;
  metrics: {
    durationMs: number;
    consoleErrors: number;
    networkErrors: number;
    accessibilityIssues: number;
    testedDevices: number;
  };
  error?: string;
}

export interface AppConfig {
  provider: "deepseek" | "deterministic";
  model: string | null;
  demoUrl: string;
}
