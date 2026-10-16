import { chromium } from 'playwright';

const OUT = process.argv[2] || '.';
const BASE = 'http://localhost:5173';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [
    '--ignore-gpu-blocklist',
    '--enable-gpu',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[err] ${e.message}`));

// --- track inspector ---
await page.goto(`${BASE}/dev/tracks`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.getByText('play', { exact: true }).click().catch(() => {});
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/m4_inspector.png` });

// --- arena edge glow (force glow via dev hook) ---
await page.goto(`${BASE}/?room=TEST`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.getByText('Begin').click();
await page.waitForTimeout(900);
await page.getByText('Enter arena').click();
await page.waitForTimeout(1200);
await page.evaluate(() => window.tide && window.tide.setDevGlow(1));
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/m4_edge_glow.png` });
await page.evaluate(() => window.tide && window.tide.setDevGlow(0.0));
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/m4_edge_glow_off.png` });

await browser.close();
console.log(logs.slice(-12).join('\n'));
