/**
 * Goal-mouth visual check: idle, full crescendo glow, and a scorer flash.
 *   node tools/capture/capture_goals.mjs [outDir] [prefix]
 */
import { chromium } from 'playwright';
const OUT = process.argv[2] || '.';
const PRE = process.argv[3] || 'goals';
const BASE = 'http://localhost:5173';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
await page.goto(`${BASE}/?room=TEST`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await page.getByText('Begin').click();
await page.waitForTimeout(900);
await page.getByText('Enter arena').click();
await page.waitForTimeout(1500);
await page.getByText('hide', { exact: true }).click().catch(() => {});
await page.evaluate(() => window.tide && window.tide.setDevGlow(0));
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/${PRE}_idle.png` });
await page.evaluate(() => window.tide && window.tide.setDevGlow(1));
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/${PRE}_build.png` });
await page.evaluate(() => window.tide && window.tide.setDevGlow(null));
await page.evaluate(() => window.tide && window.tide.devScore('B'));
await page.waitForTimeout(120);
await page.screenshot({ path: `${OUT}/${PRE}_flash.png` });
await b.close();
console.log('ERRORS:', errs.length ? errs.slice(0, 6).join(' | ') : 'none');
