import { describe, expect, it } from "vitest";
import { issueToRunInput, parseIssueUrl, parseRepositoryConfig } from "../src/github/issue-parser.js";
import type { GitHubIssue } from "../src/github/types.js";

describe("GitHub issue parser", () => {
  it("parses a canonical GitHub issue URL", () => {
    expect(parseIssueUrl("https://github.com/acme/shop/issues/42")).toEqual({
      repository: "acme/shop",
      issueNumber: 42,
      issueUrl: "https://github.com/acme/shop/issues/42"
    });
  });

  it("rejects non-GitHub and non-issue URLs", () => {
    expect(() => parseIssueUrl("https://example.com/acme/shop/issues/42")).toThrow("GitHub Issue");
    expect(() => parseIssueUrl("https://github.com/acme/shop/pull/42")).toThrow("GitHub Issue");
  });

  it("extracts bilingual issue sections and devices", () => {
    const issue: GitHubIssue = {
      number: 7,
      title: "购物车没有更新",
      body: "### Target URL\n\nhttps://shop.example.com/cart\n\n### 问题描述\n\n点击按钮后数量仍为 0。\n\n### 期望结果\n\n数量应变为 1。\n\n### Device\n\niPhone 13",
      html_url: "https://github.com/acme/shop/issues/7",
      labels: []
    };
    const input = issueToRunInput(issue, parseRepositoryConfig());
    expect(input.url).toBe("https://shop.example.com/cart");
    expect(input.issue).toContain("点击按钮后数量仍为 0");
    expect(input.expected).toBe("数量应变为 1。");
    expect(input.devices).toEqual(["iphone13"]);
  });

  it("loads repository YAML overrides", () => {
    const parsed = parseRepositoryConfig("triggerLabel: reprolens\ndevices: [desktop]\npublish:\n  issueComment: false\n  checkRun: true");
    expect(parsed.triggerLabel).toBe("reprolens");
    expect(parsed.devices).toEqual(["desktop"]);
    expect(parsed.publish.issueComment).toBe(false);
    expect(parsed.qualityGate.minScore).toBe(75);
  });

  it("loads quality gate overrides", () => {
    const parsed = parseRepositoryConfig("qualityGate:\n  enabled: true\n  minScore: 90\n  maxPerformanceIssues: 0");
    expect(parsed.qualityGate).toMatchObject({ enabled: true, minScore: 90, maxPerformanceIssues: 0 });
  });
});
