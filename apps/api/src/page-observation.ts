import { chromium } from "playwright";
import { config } from "./config.js";
import { viewports } from "./business.js";
import type { DeviceName, ReproTarget } from "./types.js";

export interface PageObservation {
  version: 1;
  device: DeviceName;
  elements: Array<{ tag: string; target?: ReproTarget; disabled: boolean; readonly: boolean }>;
  truncated: boolean;
  durationMs: number;
}

export function allowedObservationUrl(value: string, origins: string[]): URL {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !origins.includes(url.origin))
    throw new Error("页面观察仅支持授权站点，请在 REPROLENS_OBSERVATION_ORIGINS 配置完整 origin");
  return url;
}

// Runs inside the page: collect bounded locator metadata, never form values or page HTML.
export function collectElements() {
  const nodes = Array.from(document.querySelectorAll('h1,h2,h3,button,a,input,textarea,[role="button"],[role="tab"],[role="heading"]'));
  const elements: PageObservation["elements"] = [];
  let visibleCount = 0;
  for (const element of nodes.slice(0, 500)) {
    if (element.closest('[hidden],[aria-hidden="true"]') || !element.getClientRects().length) continue;
    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "none") continue;
    if (element instanceof HTMLInputElement && ["password", "hidden"].includes(element.type)) continue;
    visibleCount++;
    if (elements.length >= 50) continue;
    const tag = element.tagName.toLowerCase();
    const field = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element : null;
    const labelled = element.getAttribute("aria-labelledby")?.split(/\s+/).map(id => document.getElementById(id)?.textContent ?? "").join(" ");
    const name = (element.getAttribute("aria-label") || labelled || (field ? Array.from(field.labels ?? []).map(l => l.textContent).join(" ") : element.textContent) || "")
      .replace(/\s+/g, " ").trim().slice(0, 100).replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email]")
      .replace(/(?:sk-|Bearer\s+)[\w-]+/gi, "[secret]").replace(/\b\d{7,}\b/g, "[number]");
    const role = element.getAttribute("role") || (/^h[1-3]$/.test(tag) ? "heading" : tag === "a" ? "link" : tag === "button" ? "button" : "textbox");
    let target: ReproTarget | undefined;
    if (field && name) target = { by: "label", value: name };
    else if (name && ["heading", "button", "link", "tab", "textbox", "checkbox"].includes(role))
      target = { by: "role", role: role as ReproTarget["role"], value: name };
    else if (element.id && /^[a-zA-Z][\w-]{0,60}$/.test(element.id)) target = { by: "css", value: `#${element.id}` };
    elements.push({ tag, target, disabled: Boolean(field?.disabled || element.hasAttribute("disabled")), readonly: Boolean(field?.readOnly) });
  }
  return { elements, truncated: nodes.length > 500 || visibleCount > 50 };
}

export async function observePage(value: string, device: DeviceName, origins = (process.env.REPROLENS_OBSERVATION_ORIGINS ?? `http://127.0.0.1:${config.port},http://localhost:${config.port}`).split(",").map(s => s.trim())): Promise<PageObservation> {
  const url = allowedObservationUrl(value, origins);
  const started = Date.now();
  const browser = await chromium.launch({ headless: true, channel: config.browserChannel, timeout: 10_000 });
  try {
    const context = await browser.newContext({ viewport: viewports[device], serviceWorkers: "block", acceptDownloads: false });
    await context.route("**/*", async route => {
      const req = route.request();
      const allowed = new URL(req.url()).origin === url.origin && ["GET", "HEAD"].includes(req.method());
      if (!allowed) { await route.abort(); return; }
      try {
        // Browser routing does not re-check every redirected request. Fetch without redirects.
        const response = await route.fetch({ maxRedirects: 0, timeout: 10_000 });
        if (response.status() >= 300 && response.status() < 400) await route.abort();
        else await route.fulfill({ response });
      } catch { await route.abort().catch(() => {}); }
    });
    await context.routeWebSocket("**/*", socket => socket.close());
    const page = await context.newPage();
    const timer = setTimeout(() => { void context.close().catch(() => {}); }, 12_000);
    try {
      const response = await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 10_000 });
      if (!response?.ok()) throw new Error("页面观察失败：目标页面不可用");
      await page.waitForTimeout(300);
      const snapshot = await page.evaluate(collectElements);
      return { version: 1, device, ...snapshot, durationMs: Date.now() - started };
    } finally { clearTimeout(timer); }
  } finally { await browser.close(); }
}
