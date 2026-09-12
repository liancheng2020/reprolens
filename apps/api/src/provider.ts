import OpenAI from "openai";
import { config } from "./config.js";
import { draftPlan, planPrompt, reproPlanSchema } from "./repro-plan.js";
import type { CreateRunInput, ReproPlan } from "./types.js";
import type { PageObservation } from "./page-observation.js";

export const promptVersion = "observe-plan-2";
export interface PlanningTrace {
  model: string; promptVersion: string; status: "model" | "fallback";
  errorCode?: string; durationMs: number; inputTokens: number | null; outputTokens: number | null;
  finishReason?: string; validationErrors?: string[]; modelOutput?: string;
}

function parseJson(content: string): unknown {
  return JSON.parse(content.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, "").replace(/\s*\x60\x60\x60$/, ""));
}

export class DeepSeekProvider {
  private readonly client?: OpenAI;
  constructor() {
    if (config.deepseekApiKey) this.client = new OpenAI({ apiKey: config.deepseekApiKey, baseURL: config.deepseekBaseUrl });
  }
  get configured(): boolean { return Boolean(this.client); }

  async createPlan(input: CreateRunInput, observation?: PageObservation): Promise<ReproPlan> {
    return (await this.createPlanDetailed(input, observation)).plan;
  }

  async createPlanDetailed(input: CreateRunInput, observation?: PageObservation, captureSyntheticOutput = false): Promise<{ plan: ReproPlan; trace: PlanningTrace }> {
    const started = Date.now();
    const trace: PlanningTrace = { model: config.deepseekModel, promptVersion, status: "fallback", durationMs: 0, inputTokens: null, outputTokens: null };
    const fallback = (code: string) => {
      trace.errorCode = code; trace.durationMs = Date.now() - started;
      const plan = draftPlan(input);
      plan.warnings.unshift(`模型规划未完成（${code}），返回待编辑模板，不代表模型生成成功。`);
      return { plan, trace };
    };
    if (!this.client) return fallback("NOT_CONFIGURED");
    try {
      const response = await this.client.chat.completions.create({
        model: config.deepseekModel,
        messages: [{ role: "system", content: planPrompt }, { role: "user", content: JSON.stringify({ url: input.url, issue: input.issue, expected: input.expected, observation }) }],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 3000
      }, { timeout: 25_000, maxRetries: 0 });
      trace.inputTokens = response.usage?.prompt_tokens ?? null;
      trace.outputTokens = response.usage?.completion_tokens ?? null;
      trace.finishReason = response.choices[0]?.finish_reason;
      if (captureSyntheticOutput) trace.modelOutput = response.choices[0]?.message?.content ?? "";
      const plan = reproPlanSchema.parse(parseJson(response.choices[0]?.message?.content ?? "{}"));
      trace.status = "model"; trace.durationMs = Date.now() - started;
      const warning = observation
        ? `已观察 ${observation.device} 初始页面，提取 ${observation.elements.length} 个元素${observation.truncated ? "（已截断）" : ""}；未操作或验证业务，仍需核对计划。`
        : "定位方式由模型建议，尚未访问页面。请核对目标、范围和测试数据后执行。";
      return { plan: { ...plan, warnings: [warning, ...plan.warnings].slice(0, 10), steps: plan.steps.map(step => ({ ...step, allowSideEffect: false })) }, trace };
    } catch (error) {
      if (error instanceof Error && error.name === "ZodError") {
        trace.validationErrors = (error as Error & { issues: Array<{ path: unknown[]; message: string }> }).issues.map(i => `${i.path.join(".")}: ${i.message}`).slice(0, 10);
      }
      return fallback(error instanceof SyntaxError ? "INVALID_JSON" : error instanceof Error && error.name === "ZodError" ? "INVALID_PLAN"
        : error instanceof Error && /timeout/i.test(error.name) ? "MODEL_TIMEOUT" : "MODEL_REQUEST_FAILED");
    }
  }
}
