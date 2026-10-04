import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../src/config.js";
import { DeepSeekProvider } from "../src/provider.js";
import { demoScenarios } from "../src/demo-scenarios.js";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({ default: class { chat = { completions: { create } }; } }));
const originalKey = config.deepseekApiKey;
const input = { ...demoScenarios[0]!, url: "http://localhost/demo/shop" };

describe("actual planning trace", () => {
  beforeEach(() => { config.deepseekApiKey = "test-only"; create.mockReset(); });
  afterEach(() => { config.deepseekApiKey = originalKey; });
  it("records usage and prompt version only from the actual provider response", async () => {
    create.mockResolvedValue({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(input.plan) } }], usage: { prompt_tokens: 150, completion_tokens: 100 } });
    const result = await new DeepSeekProvider().createPlanDetailed(input);
    expect(result.trace).toMatchObject({ status: "model", inputTokens: 150, outputTokens: 100, promptVersion: "observe-plan-2" });
    expect(result.trace.modelOutput).toBeUndefined();
    expect(result.plan.steps.every(step => !step.allowSideEffect)).toBe(true);
  });
  it("marks invalid model output as a template even with a configured key", async () => {
    create.mockResolvedValue({ choices: [{ message: { content: "not json" } }] });
    const result = await new DeepSeekProvider().createPlanDetailed(input);
    expect(result.trace).toMatchObject({ status: "fallback", errorCode: "INVALID_JSON", inputTokens: null });
  });
  it("does not invoke the model without a key", async () => {
    config.deepseekApiKey = "";
    const result = await new DeepSeekProvider().createPlanDetailed(input);
    expect(result.trace.errorCode).toBe("NOT_CONFIGURED");
    expect(create).not.toHaveBeenCalled();
  });
});
