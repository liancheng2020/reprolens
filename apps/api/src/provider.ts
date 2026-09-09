import OpenAI from "openai";
import { config } from "./config.js";
import { draftPlan, planPrompt, reproPlanSchema } from "./repro-plan.js";
import type { CreateRunInput, ReproPlan } from "./types.js";

function parseJson(content: string): unknown {
  return JSON.parse(content.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, "").replace(/\s*\x60\x60\x60$/, ""));
}

export class DeepSeekProvider {
  private readonly client?: OpenAI;
  constructor() {
    if (config.deepseekApiKey) this.client = new OpenAI({ apiKey: config.deepseekApiKey, baseURL: config.deepseekBaseUrl });
  }
  get configured(): boolean { return Boolean(this.client); }

  async createPlan(input: CreateRunInput): Promise<ReproPlan> {
    if (!this.client) return draftPlan(input);
    try {
      const response = await this.client.chat.completions.create({
        model: config.deepseekModel,
        messages: [{ role: "system", content: planPrompt }, { role: "user", content: JSON.stringify({ url: input.url, issue: input.issue, expected: input.expected }) }],
        response_format: { type: "json_object" },
        max_tokens: 3000
      }, { timeout: 25_000, maxRetries: 0 });
      const plan = reproPlanSchema.parse(parseJson(response.choices[0]?.message?.content ?? "{}"));
      return { ...plan, warnings: ["定位方式由模型建议，尚未访问页面。请核对目标、范围和测试数据后执行。", ...plan.warnings].slice(0, 10), steps: plan.steps.map((step) => ({ ...step, allowSideEffect: false })) };
    } catch {
      return draftPlan(input);
    }
  }
}
