import { describe, expect, it, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({ default: class { chat = { completions: { create: mocks.create } }; } }));
vi.mock("../src/config.js", () => ({ config: { deepseekApiKey: "test", deepseekBaseUrl: "https://example.test", deepseekModel: "test", port: 8787 } }));
import { allowedObservationUrl } from "../src/page-observation.js";
import { DeepSeekProvider } from "../src/provider.js";
import { draftPlan } from "../src/repro-plan.js";
import { pairedSuccess } from "../src/evaluation/model-compare.js";
const input = { url: "https://example.test/", issue: "输入后失焦内容消失", expected: "应保留输入值", devices: ["desktop" as const] };
describe("bounded observation planning", () => {
  beforeEach(() => mocks.create.mockReset());
  it("requires exact authorized origin and rejects credentials and non-http", () => {
    expect(allowedObservationUrl(input.url, ["https://example.test"]).origin).toBe("https://example.test");
    for (const url of ["https://example.test.evil/", "https://user@example.test/", "http://example.test/", "file:///etc/passwd"])
      expect(() => allowedObservationUrl(url, ["https://example.test"])).toThrow();
  });
  it("includes observation, preserves human approval and returns usage", async () => {
    const plan = draftPlan(input); plan.steps[0]!.allowSideEffect = true;
    mocks.create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(plan) } }], usage: { prompt_tokens: 42, completion_tokens: 21 } });
    const result = await new DeepSeekProvider().createPlanDetailed(input, { version: 1, device: "desktop", elements: [], truncated: false, durationMs: 3 });
    expect(result.trace).toMatchObject({ status: "model", inputTokens: 42, outputTokens: 21 });
    expect(result.plan.steps.every(s => !s.allowSideEffect)).toBe(true);
    expect(JSON.parse(mocks.create.mock.calls[0]![0].messages[1].content).observation).toBeDefined();
  });
  it("classifies invalid JSON and schema without presenting fallback as success", async () => {
    mocks.create.mockResolvedValueOnce({ choices: [{ message: { content: "bad" } }] });
    expect((await new DeepSeekProvider().createPlanDetailed(input)).trace.errorCode).toBe("INVALID_JSON");
    mocks.create.mockResolvedValueOnce({ choices: [{ message: { content: "{}" } }] });
    expect((await new DeepSeekProvider().createPlanDetailed(input)).trace.errorCode).toBe("INVALID_PLAN");
  });
  it("does not score a failing process or unrelated check as a valid pair", () => {
    const bug = { validCheck: false, verdict: "reproduced", steps: [] };
    expect(pairedSuccess(bug, { validCheck: true, verdict: "not_reproduced", steps: [] })).toBe(false);
  });
});
