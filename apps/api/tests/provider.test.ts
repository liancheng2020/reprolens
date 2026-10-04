import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../src/config.js";
import { DeepSeekProvider, modelErrorCode } from "../src/provider.js";
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
  it("rejects truncated output even if its JSON happens to be valid", async () => {
    create.mockResolvedValue({ choices: [{ finish_reason: "length", message: { content: JSON.stringify(input.plan) } }], usage: { prompt_tokens: 10, completion_tokens: 3000 } });
    expect((await new DeepSeekProvider().createPlanDetailed(input)).trace).toMatchObject({ status: "fallback", errorCode: "OUTPUT_TRUNCATED", outputTokens: 3000 });
  });
  it("records refusals and timeouts without treating templates as successful plans", async () => {
    create.mockResolvedValue({ choices: [{ message: { refusal: "blocked" } }] });
    expect((await new DeepSeekProvider().createPlanDetailed(input)).trace.errorCode).toBe("MODEL_REFUSAL");
    create.mockRejectedValue(Object.assign(new Error("timeout"), { name: "APIConnectionTimeoutError" }));
    expect((await new DeepSeekProvider().createPlanDetailed(input)).trace.errorCode).toBe("MODEL_TIMEOUT");
  });
  it("distinguishes configuration, quota and service failures without recording credentials", async () => {
    for (const [status, code] of [[400, "MODEL_REQUEST_INVALID"], [401, "MODEL_AUTH_FAILED"], [402, "MODEL_QUOTA_EXHAUSTED"], [404, "MODEL_NOT_FOUND"], [429, "MODEL_RATE_LIMITED"], [503, "MODEL_SERVICE_UNAVAILABLE"]] as const) {
      expect(modelErrorCode({ status })).toBe(code);
    }
    create.mockRejectedValue(Object.assign(new Error("secret response body"), { status: 404 }));
    const result = await new DeepSeekProvider().createPlanDetailed(input);
    expect(result.trace).toMatchObject({ httpStatus: 404, errorCode: "MODEL_NOT_FOUND" });
    expect(result.plan.warnings[0]).toContain("DEEPSEEK_MODEL");
    expect(JSON.stringify(result)).not.toContain("secret response body");
  });
});
