import fs from "node:fs/promises";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { config } from "./config.js";
import type { ReproRun, VisualComparison } from "./types.js";

function whiteCanvas(width: number, height: number): PNG {
  const image = new PNG({ width, height });
  image.data.fill(255);
  return image;
}

function place(source: PNG, target: PNG): void {
  for (let y = 0; y < source.height; y += 1) {
    const sourceStart = y * source.width * 4;
    const targetStart = y * target.width * 4;
    source.data.copy(target.data, targetStart, sourceStart, sourceStart + source.width * 4);
  }
}

export class VisualDiffService {
  async compare(baseline: ReproRun, current: ReproRun): Promise<VisualComparison[]> {
    const comparisons: VisualComparison[] = [];

    for (const screenshot of current.screenshots) {
      const baselineScreenshot = baseline.screenshots.find((item) => item.device === screenshot.device);
      if (!baselineScreenshot) continue;

      const baselinePath = path.join(config.artifactsDir, baseline.id, `${screenshot.device}.png`);
      const currentPath = path.join(config.artifactsDir, current.id, `${screenshot.device}.png`);
      const [baselineImage, currentImage] = await Promise.all([
        fs.readFile(baselinePath).then(PNG.sync.read),
        fs.readFile(currentPath).then(PNG.sync.read)
      ]);
      const width = Math.max(baselineImage.width, currentImage.width);
      const height = Math.max(baselineImage.height, currentImage.height);
      const baselineCanvas = whiteCanvas(width, height);
      const currentCanvas = whiteCanvas(width, height);
      const diff = whiteCanvas(width, height);
      place(baselineImage, baselineCanvas);
      place(currentImage, currentCanvas);

      const mismatchPixels = pixelmatch(baselineCanvas.data, currentCanvas.data, diff.data, width, height, {
        threshold: 0.1,
        includeAA: false,
        alpha: 0.45,
        diffColor: [255, 94, 112]
      });
      const filename = `${screenshot.device}-diff.png`;
      await fs.writeFile(path.join(config.artifactsDir, current.id, filename), PNG.sync.write(diff));
      comparisons.push({
        id: `${current.id}-${screenshot.device}-diff`,
        device: screenshot.device,
        baselineUrl: baselineScreenshot.url,
        currentUrl: screenshot.url,
        diffUrl: `/artifacts/${current.id}/${filename}`,
        width,
        height,
        mismatchPixels,
        mismatchRatio: mismatchPixels / (width * height)
      });
    }

    return comparisons;
  }
}
