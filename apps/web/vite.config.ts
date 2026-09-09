import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

async function waitForApi(target: string): Promise<void> {
  console.log(`[ReproLens] 等待 API 就绪：${target}`);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${target}/health`, { signal: AbortSignal.timeout(800) });
      if (response.ok && (await response.json()).service === "reprolens-api") return;
    } catch {
      // API imports and watch-mode restarts can briefly leave the port unavailable.
    }
    await delay(250);
  }
  throw new Error(`API 在 30 秒内未就绪（${target}）。请查看 API 终端错误；单独启动前端时，需要先启动 API。`);
}

export default defineConfig(async ({ command, mode }) => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const env = loadEnv(mode, root, "PORT");
  const port = Number(process.env.PORT ?? env.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT 必须为 1–65535 的整数");
  const target = `http://127.0.0.1:${port}`;
  if (command === "serve") await waitForApi(target);
  return {
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": target,
      "/artifacts": target,
      "/demo": target
    }
  }
  };
});
