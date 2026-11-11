// Рендерит build/icon.svg в build/icon.png (1024×1024) через Chromium Playwright.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '..', 'build', 'icon.svg'), 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.locator('svg').screenshot({ path: path.join(__dirname, '..', 'build', 'icon.png'), omitBackground: true });
  await browser.close();
  console.log('build/icon.png готов');
})();
