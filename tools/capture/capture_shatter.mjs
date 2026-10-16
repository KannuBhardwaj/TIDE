import { chromium } from 'playwright';
const OUT = process.argv[2] || '.';
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
await page.waitForTimeout(1200);
await page.evaluate(() => window.tide && window.tide.devScore('A'));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/shatter.png` }); // shards phase
await page.waitForTimeout(5200);
await page.screenshot({ path: `${OUT}/countdown.png` }); // countdown phase
await b.close();
console.log('ERRORS:', errs.length ? errs.slice(0, 6).join(' | ') : 'none');
