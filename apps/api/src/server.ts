import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express from "express";
import { z } from "zod";
import { config, projectRoot } from "./config.js";
import { demoShopHtml } from "./demo-page.js";
import { RunManager } from "./run-manager.js";
import { RunStore } from "./store.js";

const deviceSchema = z.enum(["desktop", "iphone13", "pixel7"]);
const createRunSchema = z.object({
  url: z.string().trim().url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "仅支持 HTTP/HTTPS 地址"),
  issue: z.string().trim().min(8, "请描述需要复现的问题").max(3000),
  expected: z.string().trim().min(4, "请填写期望结果").max(2000),
  devices: z.array(deviceSchema).min(1).max(3)
});

const store = new RunStore();
await store.init();
const manager = new RunManager(store);
const app = express();

app.disable("x-powered-by");
app.use(cors({ origin: config.webOrigin }));
app.use(express.json({ limit: "256kb" }));
app.use("/artifacts", express.static(config.artifactsDir, { fallthrough: false, maxAge: "1h" }));

app.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "reproflow-api",
    provider: manager.providerConfigured ? "deepseek" : "deterministic",
    model: manager.providerConfigured ? config.deepseekModel : null
  });
});

app.get("/api/config", (_request, response) => {
  response.json({
    provider: manager.providerConfigured ? "deepseek" : "deterministic",
    model: manager.providerConfigured ? config.deepseekModel : null,
    demoUrl: `http://127.0.0.1:${config.port}/demo/shop`
  });
});

app.get("/api/runs", async (_request, response, next) => {
  try {
    response.json(await store.list());
  } catch (error) {
    next(error);
  }
});

app.post("/api/runs", async (request, response, next) => {
  try {
    const parsed = createRunSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(422).json({ error: "输入校验失败", details: parsed.error.flatten() });
      return;
    }
    const run = await manager.create(parsed.data);
    response.status(202).json(run);
  } catch (error) {
    next(error);
  }
});

app.get("/api/runs/:id", async (request, response, next) => {
  try {
    const run = await store.get(request.params.id);
    if (!run) {
      response.status(404).json({ error: "任务不存在" });
      return;
    }
    response.json(run);
  } catch (error) {
    next(error);
  }
});

app.get("/api/runs/:id/events", async (request, response, next) => {
  try {
    if (!(await manager.subscribe(request.params.id, response))) {
      response.status(404).json({ error: "任务不存在" });
    }
  } catch (error) {
    next(error);
  }
});

app.get("/demo/shop", (_request, response) => response.type("html").send(demoShopHtml));
app.post("/demo/api/cart", (_request, response) => {
  response.status(500).json({ error: "inventory service temporarily unavailable", traceId: "demo-cart-500" });
});

const webDist = path.join(projectRoot, "apps", "web", "dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get("/{*path}", (_request, response) => response.sendFile(path.join(webDist, "index.html")));
}

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  console.error(`[reproflow] ${message}`);
  response.status(500).json({ error: "服务内部错误", message });
});

const server = app.listen(config.port, "127.0.0.1", () => {
  console.log(`ReproFlow API running at http://127.0.0.1:${config.port}`);
  console.log(`Provider: ${manager.providerConfigured ? `${config.deepseekModel} (DeepSeek)` : "deterministic fallback"}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
