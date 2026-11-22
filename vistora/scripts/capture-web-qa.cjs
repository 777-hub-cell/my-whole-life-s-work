const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const out = process.env.VISTORA_SCREENSHOT_DIR || path.join(process.cwd(), 'vistora-web-qa');
  fs.mkdirSync(out, { recursive: true });
  const errors = [];
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true
    });
    page.on('pageerror', (error) => errors.push(error.message));
    const appPath = path.resolve('vistora/index.html');
    await page.goto(pathToFileURL(appPath).href, { waitUntil: 'domcontentloaded' });
    await page.locator('#nav button').first().waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(out, '01-home.png') });

    const routes = [
      ['library', '02-library.png'],
      ['discover', '04-discover.png'],
      ['stats', '05-stats.png'],
      ['settings', '06-settings.png']
    ];
    for (const [route, file] of routes) {
      await page.locator('#nav button[data-to="' + route + '"]').click();
      await page.waitForTimeout(350);
      await page.screenshot({ path: path.join(out, file) });
      if (route === 'library') {
        await page.locator('#fab').click();
        await page.locator('#addForm').waitFor({ state: 'visible', timeout: 5000 });
        await page.screenshot({ path: path.join(out, '03-add-title.png') });
        await page.keyboard.press('Escape');
        await page.locator('#layer .sheet').waitFor({ state: 'detached', timeout: 5000 });
      }
    }
    if (errors.length) {
      console.error('Browser runtime errors:', errors.join('\n'));
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
  console.log('Captured Home, Library, Add Title, Discover, Stats and Settings at 390 × 844.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
