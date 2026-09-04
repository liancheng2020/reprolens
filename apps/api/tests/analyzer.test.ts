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
});
