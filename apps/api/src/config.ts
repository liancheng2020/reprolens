import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(here, "../../..");

dotenv.config({ path: path.join(projectRoot, ".env") });
const browserChannel = process.env.REPROLENS_BROWSER_CHANNEL?.trim();
if (browserChannel && browserChannel !== "chrome") throw new Error("REPROLENS_BROWSER_CHANNEL 仅支持 chrome，留空使用 Playwright Chromium");

export const config = {
  port: Number(process.env.PORT ?? 8787),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  headless: process.env.HEADLESS !== "false",
  browserChannel: browserChannel || undefined,
  deepseekApiKey: process.env.DEEPSEEK_API_KEY?.trim() ?? "",
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
  deepseekModel: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
  githubToken: (process.env.REPROLENS_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? "").trim(),
  githubWebhookSecret: (process.env.REPROLENS_GITHUB_WEBHOOK_SECRET ?? "").trim(),
  githubTriggerLabel: process.env.REPROLENS_GITHUB_TRIGGER_LABEL ?? "needs-reproduction",
  artifactsDir: path.join(projectRoot, "artifacts"),
  dataDir: path.join(projectRoot, "data", "runs")
};
