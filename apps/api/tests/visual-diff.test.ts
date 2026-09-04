import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { config } from "../src/config.js";
import type { ReproRun } from "../src/types.js";
import { VisualDiffService } from "../src/visual-diff.js";

const baselineId = "visual-diff-baseline-test";
const currentId = "visual-diff-current-test";

function run(id: string): ReproRun {
  return {
    id,
    createdAt: "2026-09-04T00:00:00.000Z",
    status: "completed",
    currentStep: "完成",
    input: { url: "http://example.com", issue: "页面显示异常", expected: "页面正常显示", devices: ["desktop"] },
    provider: "deterministic",
    timeline: [],
    findings: [],
    screenshots: [{ id: `${id}-desktop`, label: "Desktop", device: "desktop", viewport: { width: 2, height: 2 }, url: `/artifacts/${id}/desktop.png` }],
    metrics: { durationMs: 0, consoleErrors: 0, networkErrors: 0, accessibilityIssues: 0, testedDevices: 1 }
  };
}

async function writeImage(id: string, changed: boolean): Promise<void> {
  const directory = path.join(config.artifactsDir, id);
  await fs.mkdir(directory, { recursive: true });
  const image = new PNG({ width: 2, height: 2 });
  image.data.fill(255);
  if (changed) image.data.set([0, 0, 0, 255], 0);
  await fs.writeFile(path.join(directory, "desktop.png"), PNG.sync.write(image));
}

describe("visual diff service", () => {
  beforeAll(async () => Promise.all([writeImage(baselineId, false), writeImage(currentId, true)]));
  afterAll(async () => Promise.all([
    fs.rm(path.join(config.artifactsDir, baselineId), { recursive: true, force: true }),
    fs.rm(path.join(config.artifactsDir, currentId), { recursive: true, force: true })
  ]));

  it("writes a diff artifact and returns a stable ratio", async () => {
    const [comparison] = await new VisualDiffService().compare(run(baselineId), run(currentId));
    expect(comparison.mismatchPixels).toBe(1);
    expect(comparison.mismatchRatio).toBe(0.25);
    await expect(fs.stat(path.join(config.artifactsDir, currentId, "desktop-diff.png"))).resolves.toBeDefined();
  });
});
