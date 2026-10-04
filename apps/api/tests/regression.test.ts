import { describe, expect, it } from "vitest";
import { canVerifyDemoRegression, gradeDemoReplay } from "../src/regression.js";
import { config } from "../src/config.js";
import { generateBusinessTest } from "../src/business-test.js";
import { demoScenarios } from "../src/demo-scenarios.js";
import { reproPlanSchema } from "../src/repro-plan.js";
import type { ReproRun } from "../src/types.js";

const demo = demoScenarios[2]!;
const input = { ...demo, demoId: demo.id, url: `http://127.0.0.1:${config.port}${demo.path}`, plan: reproPlanSchema.parse(demo.plan), planConfirmed: true };
const code = generateBusinessTest(input, true);
const baseline = { id: "baseline", input, verdict: "reproduced", generatedTest: code,
  business: { steps: [{ device: "desktop", index: 1, phase: "check", status: "failed" }] } } as ReproRun;
const current = { input: { ...input, url: input.url.replace("fixed=0", "fixed=1") }, verification: { business: { status: "fixed" } } } as ReproRun;
const failureLine = code.split("\n").findLastIndex(line => line.includes("toHaveValue")) + 1;
const report = (status: string, line = failureLine) => ({ suites: [{ specs: [{ title: `desktop · ${input.plan.objective}`, tests: [{ results: [{ status, error: { location: { file: "/tmp/regression.spec.ts", line } } }] }] }] }] });

describe("controlled exported-test validation", () => {
  it("only replays canonical plans on the local built-in versions", () => {
    expect(canVerifyDemoRegression(baseline, current)).toBe(true);
    expect(canVerifyDemoRegression(baseline, { ...current, input: { ...current.input, url: "https://example.com/demo/profile?fixed=1" } })).toBe(false);
    expect(canVerifyDemoRegression({ ...baseline, generatedTest: code + "\nmalicious();" }, current)).toBe(false);
    expect(canVerifyDemoRegression({ ...baseline, input: { ...input, plan: { ...input.plan, objective: "changed" } } }, current)).toBe(false);
  });
  it("requires bug failure at the original core assertion and fixed-version success", () => {
    expect(gradeDemoReplay(report("failed"), 1, baseline, false, code)).toBe(true);
    expect(gradeDemoReplay(report("passed"), 0, baseline, true, code)).toBe(true);
    expect(gradeDemoReplay(report("passed"), 0, baseline, false, code)).toBe(false);
    expect(gradeDemoReplay(report("failed", 20), 1, baseline, false, code)).toBe(false);
    expect(gradeDemoReplay(report("timedOut"), 1, baseline, false, code)).toBe(false);
    expect(gradeDemoReplay({ suites: [] }, 1, baseline, false, code)).toBe(false);
    expect(gradeDemoReplay(report("passed"), null, baseline, true, code)).toBe(false);
  });
});
