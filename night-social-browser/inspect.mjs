import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve("artifacts");
await fs.mkdir(outputDir, { recursive: true });

const targets = [
  { name: "x-reference", url: "https://x.com/home" },
  { name: "night-social", url: "https://night-social.vercel.app/" }
];

const viewports = [
  { name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: "desktop", width: 1440, height: 960, isMobile: false, hasTouch: false, deviceScaleFactor: 1 }
];

function safeUrl(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return String(value).slice(0, 200);
  }
}

const browser = await chromium.launch({ headless: true });
const report = {
  generatedAt: new Date().toISOString(),
  browser: browser.version(),
  note: "Unauthenticated public-page inspection only. No account cookies, passwords, or browser storage are loaded or saved.",
  results: []
};

try {
  for (const target of targets) {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
        isMobile: viewport.isMobile,
        hasTouch: viewport.hasTouch,
        colorScheme: "light",
        reducedMotion: "reduce"
      });
      const page = await context.newPage();
      const errors = [];
      const failedRequests = [];
      let documentStatus = null;
      let navigationError = null;

      page.on("pageerror", error => errors.push(String(error.message).slice(0, 300)));
      page.on("console", message => {
        if (message.type() === "error" && errors.length < 20) {
          errors.push(message.text().slice(0, 300));
        }
      });
      page.on("requestfailed", request => {
        if (failedRequests.length < 20) {
          failedRequests.push({
            url: safeUrl(request.url()),
            failure: request.failure()?.errorText ?? "request failed"
          });
        }
      });

      try {
        const response = await page.goto(target.url, {
          waitUntil: "domcontentloaded",
          timeout: 45000
        });
        documentStatus = response?.status() ?? null;
        await page.waitForTimeout(3500);
      } catch (error) {
        navigationError = String(error.message).slice(0, 500);
      }

      const screenshot = path.join(outputDir, `${target.name}-${viewport.name}.png`);
      try {
        await page.screenshot({ path: screenshot, fullPage: false, animations: "disabled" });
      } catch (error) {
        errors.push(`Screenshot: ${String(error.message).slice(0, 250)}`);
      }

      let title = "";
      try { title = await page.title(); } catch {}
      report.results.push({
        target: target.name,
        requestedUrl: target.url,
        finalUrl: safeUrl(page.url()),
        viewport: viewport.name,
        viewportSize: { width: viewport.width, height: viewport.height },
        httpStatus: documentStatus,
        title,
        navigationError,
        consoleOrPageErrors: errors,
        failedRequests,
        screenshot: path.basename(screenshot)
      });

      await context.close();
    }
  }
} finally {
  await browser.close();
}

await fs.writeFile(
  path.join(outputDir, "inspection-report.json"),
  JSON.stringify(report, null, 2) + "\n"
);

console.log(JSON.stringify(report, null, 2));
