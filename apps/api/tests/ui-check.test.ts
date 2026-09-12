import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { uiProbe } from "../src/ui-check.js";
import { demoScenarios } from "../src/demo-scenarios.js";
import { reproPlanSchema, planPrompt } from "../src/repro-plan.js";
import { generateBusinessTest } from "../src/business-test.js";

function observe({ x = 10, y = 10, width = 100, height = 40, hit = "self" } = {}) {
  const child = { tagName: "SPAN", id: "label" };
  const element = { tagName: "BUTTON", id: "confirm", contains: (other: unknown) => other === child,
    getBoundingClientRect: () => ({ x, y, left: x, top: y, right: x + width, bottom: y + height, width, height }) };
  return vm.runInNewContext(`(${uiProbe})(element)`, { element,
    window: { innerWidth: 390, innerHeight: 844 },
    document: { elementFromPoint: () => hit === "self" ? element : hit === "child" ? child : hit === "none" ? null : { tagName: "NAV", id: "overlay" } }
  });
}

describe("UI target geometry and hit testing", () => {
  it("accepts the target and its descendants", () => {
    expect(observe().clear).toBe(true);
    expect(observe({ hit: "child" }).clear).toBe(true);
  });
  it("rejects center overlays and missing hits", () => {
    expect(observe({ hit: "overlay" })).toMatchObject({ clear: false, inViewport: true, centerClear: false, hit: "nav#overlay" });
    expect(observe({ hit: "none" }).clear).toBe(false);
  });
  it("rejects partially out-of-viewport and zero-area elements without scrolling them into view", () => {
    expect(observe({ y: 830 }).clear).toBe(false);
    expect(observe({ x: -1 }).clear).toBe(false);
    expect(observe({ width: 0 }).clear).toBe(false);
  });
  it("shares the exact fixed probe with generated tests", () => {
    const demo = demoScenarios[0];
    expect(reproPlanSchema.safeParse(demo.plan).success).toBe(true);
    const code = generateBusinessTest({ ...demo, url: "http://127.0.0.1/demo/modal", planConfirmed: true });
    expect(code).toContain(uiProbe.toString());
    expect(planPrompt).toContain("response|unobscured");
    for (const item of demoScenarios) expect(reproPlanSchema.safeParse(item.plan).success).toBe(true);
  });
});
