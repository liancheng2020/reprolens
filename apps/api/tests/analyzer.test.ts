import { describe, expect, it } from "vitest";
import { buildFindings, calculateScore } from "../src/analyzer.js";
import type { AuditSnapshot } from "../src/types.js";

const cleanAudit: AuditSnapshot = {
  device: "iphone13",
  viewport: { width: 390, height: 844 },
  horizontalOverflow: 0,
  missingAlt: [],
  unlabeledControls: [],
  clippedElements: [],
  consoleErrors: [],
  networkErrors: [],
  pageErrors: []
};

describe("deterministic analyzer", () => {
  it("turns browser evidence into structured findings", () => {
    const findings = buildFindings({
      ...cleanAudit,
      horizontalOverflow: 120,
      networkErrors: [{ url: "http://localhost/api/cart", status: 500 }]
    });

    expect(findings).toHaveLength(2);
    expect(findings.map((item) => item.category)).toEqual(["visual", "network"]);
    expect(calculateScore(findings)).toBe(64);
  });

  it("keeps a clean page at score 100", () => {
    expect(calculateScore(buildFindings(cleanAudit))).toBe(100);
  });

  it("deduplicates the same root cause across devices", () => {
    const mobile = buildFindings({ ...cleanAudit, horizontalOverflow: 120 });
    const pixel = mobile.map((finding) => ({ ...finding, id: finding.id + "-pixel", device: "pixel7" as const }));
    expect(calculateScore([...mobile, ...pixel])).toBe(82);
  });

  it("maps axe violations to actionable WCAG findings without legacy duplicates", () => {
    const findings = buildFindings({
      ...cleanAudit,
      missingAlt: [{ selector: "#hero" }],
      axeViolations: [{
        id: "image-alt",
        impact: "critical",
        help: "Images must have alternate text",
        helpUrl: "https://dequeuniversity.com/rules/axe/image-alt",
        description: "Ensure images have alternative text",
        nodes: [{ target: ["#hero"], html: "<img id=\"hero\">", failureSummary: "Fix any of the following: Element does not have an alt attribute" }]
      }]
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ category: "accessibility", severity: "high", ruleId: "image-alt", selector: "#hero" });
    expect(findings[0].recommendation).toContain("alt attribute");
  });

  it("turns poor Core Web Vitals into performance findings", () => {
    const findings = buildFindings({
      ...cleanAudit,
      vitals: { lcpMs: 4500, cls: 0.02, inpMs: 120, fcpMs: 900, ttfbMs: 200, resourceCount: 12, transferSizeKb: 180 }
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ category: "performance", severity: "high", ruleId: "lcp" });
  });
});
