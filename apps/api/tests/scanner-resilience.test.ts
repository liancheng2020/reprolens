import { expect, it, vi } from "vitest";
import { optionalCapture } from "../src/scanner.js";

it("keeps supplementary screenshot errors from invalidating core evidence", async () => {
  const warn = vi.fn().mockResolvedValue(undefined);
  expect(await optionalCapture(async () => { throw new Error("screenshot timeout"); }, warn)).toBe(false);
  expect(warn).toHaveBeenCalledOnce();
  expect(await optionalCapture(async () => {}, warn)).toBe(true);
});
