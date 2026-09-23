import { chromium } from "playwright";
import { config } from "./config.js";

export class BrowserUnavailableError extends Error {}

export async function checkBrowser(launch = () => chromium.launch({ headless: config.headless, channel: config.browserChannel, timeout: 10_000 })) {
  try {
    const browser = await launch();
    await browser.close();
    return { ready: true, message: "浏览器可启动" };
  } catch {
    return { ready: false, message: config.browserChannel === "chrome"
      ? "Chrome 无法启动。请确认已安装 Chrome，或移除 REPROLENS_BROWSER_CHANNEL 后运行 npm run browser:install。"
      : "复现浏览器无法启动。请在项目根目录运行 npm run browser:install；若已安装，请检查浏览器启动权限，然后重新检查。" };
  }
}

export async function requireBrowser(check = checkBrowser) {
  const result = await check();
  if (!result.ready) throw new BrowserUnavailableError(result.message);
}
