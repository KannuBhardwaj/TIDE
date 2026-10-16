/**
 * Visual verification tool. Drives the running dev server with Playwright
 * (system Chrome, real GPU), stirs the water, and saves screenshots so we can
 * review the render each milestone. Usage:
 *   npm run dev            # in one terminal
 *   node tools/capture/capture.mjs [outDir]
 */
import { chromium } from 'playwright';

const OUT = process.argv[2] || '.';
const URL = process.env.TIDE_URL || 'http://localhost:5173/';

const browser = await chromium.launch({
  channel: 'chrome', // system Chrome => real GPU, no browser download
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

const errPanel = await page.locator('text=WebGL error').count();

async function drag(x1, y1, x2, y2) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(x1 + ((x2 - x1) * i) / 12, y1 + ((y2 - y1) * i) / 12);
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
}

await drag(420, 320, 760, 480);
await page.waitForTimeout(250);
await drag(820, 300, 520, 540);
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/m1_play.png` });
await page.waitForTimeout(2200);
await page.screenshot({ path: `${OUT}/m1_settled.png` });

await page.keyboard.press('d');
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/m1_debug_dye.png` });
await page.keyboard.press('d');
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/m1_debug_velocity.png` });

await browser.close();
console.log('ERROR_PANEL_COUNT=' + errPanel);
console.log(logs.join('\n'));
