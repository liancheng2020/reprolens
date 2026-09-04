import { parse as parseYaml } from "yaml";
import type { CreateRunInput, DeviceName } from "../types.js";
import { repositoryConfigSchema, type GitHubIssue, type RepositoryConfig } from "./types.js";

const headings: Record<string, string[]> = {
  url: ["target url", "目标地址", "目标页面", "复现地址"],
  problem: ["problem", "actual behavior", "问题描述", "实际结果"],
  expected: ["expected behavior", "expected", "期望结果", "预期结果"],
  device: ["device", "devices", "测试设备", "设备"]
};

function extractSection(body: string, aliases: string[]): string | undefined {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => {
    const heading = line.replace(/^#{1,6}\s*/, "").trim().toLowerCase();
    return aliases.includes(heading);
  });
  if (start < 0) return undefined;
  const section: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s+/.test(line)) break;
    section.push(line);
  }
  const value = section.join("\n").trim();
  return value || undefined;
}

function parseDevices(value: string | undefined, fallback: DeviceName[]): DeviceName[] {
  if (!value || /multiple|全部|多设备/i.test(value)) return fallback;
  const devices: DeviceName[] = [];
  if (/desktop|桌面|pc/i.test(value)) devices.push("desktop");
  if (/iphone\s*13|ios/i.test(value)) devices.push("iphone13");
  if (/pixel\s*7|android/i.test(value)) devices.push("pixel7");
  return devices.length ? devices : fallback;
}

export function parseIssueUrl(value: string): { repository: string; issueNumber: number; issueUrl: string } {
  const url = new URL(value);
  const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/issues\/(\d+)\/?$/);
  if (url.protocol !== "https:" || url.hostname !== "github.com" || !match) {
    throw new Error("请输入标准 GitHub Issue 地址，例如 https://github.com/owner/repo/issues/123");
  }
  return {
    repository: `${match[1]}/${match[2]}`,
    issueNumber: Number(match[3]),
    issueUrl: `https://github.com/${match[1]}/${match[2]}/issues/${match[3]}`
  };
}

export function parseRepositoryConfig(source?: string, triggerLabel = "needs-reproduction"): RepositoryConfig {
  const value = source ? parseYaml(source) : {};
  return repositoryConfigSchema.parse({ triggerLabel, ...value });
}

export function issueToRunInput(issue: GitHubIssue, repositoryConfig: RepositoryConfig): CreateRunInput {
  const body = issue.body?.trim() ?? "";
  const explicitUrl = extractSection(body, headings.url);
  const firstUrl = body.match(/https?:\/\/[^\s<>)]+/)?.[0];
  const url = repositoryConfig.targetUrl ?? explicitUrl?.match(/https?:\/\/[^\s<>)]+/)?.[0] ?? firstUrl;
  if (!url) throw new Error("Issue 中没有找到 Target URL，请补充目标页面地址或在 .github/reprolens.yml 中配置 targetUrl");

  const problem = extractSection(body, headings.problem) ?? body;
  const expected = extractSection(body, headings.expected) ?? "页面行为应符合 Issue 描述，且不产生新的功能、视觉、网络或可访问性问题。";
  const deviceText = extractSection(body, headings.device);
  return {
    url,
    issue: [issue.title, problem].filter(Boolean).join("\n\n").slice(0, 3000),
    expected: expected.slice(0, 2000),
    devices: parseDevices(deviceText, repositoryConfig.devices)
  };
}
