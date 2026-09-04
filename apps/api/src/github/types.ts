import { z } from "zod";
import type { DeviceName } from "../types.js";

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  labels: Array<string | { name?: string }>;
}

export interface GitHubComment {
  id: number;
  body: string;
  html_url: string;
}

export interface GitHubCheckRun {
  id: number;
  html_url: string;
}

export interface GitHubRepository {
  default_branch: string;
}

export interface GitHubCommit {
  sha: string;
}

const deviceSchema = z.enum(["desktop", "iphone13", "pixel7"]);

export const repositoryConfigSchema = z.object({
  triggerLabel: z.string().trim().min(1).default("needs-reproduction"),
  targetUrl: z.string().trim().url().optional(),
  devices: z.array(deviceSchema).min(1).max(3).default(["desktop", "iphone13", "pixel7"]),
  publish: z.object({
    issueComment: z.boolean().default(true),
    checkRun: z.boolean().default(true)
  }).default({ issueComment: true, checkRun: true })
});

export type RepositoryConfig = z.infer<typeof repositoryConfigSchema> & { devices: DeviceName[] };

export interface IssueImportRequest {
  repository: string;
  issueNumber: number;
  issueUrl: string;
  trigger: "manual" | "label" | "action";
  headSha?: string;
}

export interface IssuesLabeledEvent {
  action: "labeled";
  issue: GitHubIssue;
  label: { name: string };
  repository: { full_name: string; default_branch: string };
}
