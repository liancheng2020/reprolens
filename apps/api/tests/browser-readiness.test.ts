import { describe, expect, it } from "vitest";
import type { Browser } from "playwright";
import { BrowserUnavailableError, checkBrowser, requireBrowser } from "../src/browser-readiness.js";

describe("browser readiness", () => {
  it("closes the probe browser after a successful launch", async () => {
    let closed = false;
    const result = await checkBrowser(async () => ({ close: async () => { closed = true; } }) as Browser);
    expect(result.ready).toBe(true);
    expect(closed).toBe(true);
  });
  it("returns an actionable error and blocks execution when launch fails", async () => {
    const result = await checkBrowser(async () => { throw new Error("Executable doesn't exist"); });
    expect(result.ready).toBe(false);
    expect(result.message).toContain("npm run browser:install");
    await expect(requireBrowser(async () => result)).rejects.toBeInstanceOf(BrowserUnavailableError);
  });
});
