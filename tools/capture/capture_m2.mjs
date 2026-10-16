import { chromium } from 'playwright';

const OUT = process.argv[2] || '.';
const URL = process.env.TIDE_URL || 'http://localhost:5173/';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
const errPanel = await page.locator('text=WebGL error').count();

async function drag(x1, y1, x2, y2, steps = 10) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps);
    await page.waitForTimeout(8);
  }
  await page.mouse.up();
}

// --- show player markers + a raised wall + a push ---
await page.keyboard.down('KeyE'); // P1 wall hold
await page.keyboard.down('KeyD'); // move P1 toward center
await page.waitForTimeout(500);
await page.keyboard.up('KeyD');
await page.keyboard.down('ArrowLeft'); // move P2 toward center
await page.waitForTimeout(400);
await page.keyboard.up('ArrowLeft');
await page.screenshot({ path: `${OUT}/m2_walls_players.png` });
await page.keyboard.up('KeyE');

// a couple of pushes from P2
await page.keyboard.press('Slash');
await page.waitForTimeout(120);
await page.keyboard.press('Slash');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/m2_push.png` });

// a little water stirring for ambience, then test goal/win visuals via dev hook
for (let i = 0; i < 8; i++) {
  await drag(520, 400, 1120, 400, 8);
  await page.waitForTimeout(20);
}

// --- GOAL flash (force a goal for Team A) ---
await page.evaluate(() => window.tide.devScore('A'));
await page.waitForTimeout(250);
await page.screenshot({ path: `${OUT}/m2_goal_flash.png` });
await page.waitForTimeout(1600); // let the freeze clear

// --- WIN screen (drive Team B to 5) ---
await page.evaluate(() => {
  for (let i = 0; i < 5; i++) window.tide.devScore('B');
});
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/m2_win.png` });
await page.keyboard.press('KeyR'); // restart
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/m2_after_restart.png` });

// --- obstacle debug view (cycle: dye,vel,pressure,curl,obstacle) with a wall up ---
await page.keyboard.down('KeyE');
await page.waitForTimeout(150);
for (let i = 0; i < 5; i++) {
  await page.keyboard.press('Backquote');
  await page.waitForTimeout(80);
}
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/m2_debug_obstacle.png` });
await page.keyboard.up('KeyE');

await browser.close();
console.log('ERROR_PANEL_COUNT=' + errPanel);
console.log(logs.slice(-12).join('\n'));
