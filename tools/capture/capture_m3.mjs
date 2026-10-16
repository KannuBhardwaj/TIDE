import { chromium } from 'playwright';

const OUT = process.argv[2] || '.';
const BASE = 'http://localhost:5173';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-gpu'],
});

const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const arena = await ctxA.newPage();
const logsA = [];
arena.on('console', (m) => logsA.push(`[A ${m.type()}] ${m.text()}`));
arena.on('pageerror', (e) => logsA.push(`[A err] ${e.message}`));

await arena.goto(`${BASE}/?room=TEST`, { waitUntil: 'networkidle' });
await arena.waitForTimeout(700);
await arena.getByText('Begin').click();
await arena.waitForTimeout(900);
await arena.screenshot({ path: `${OUT}/m3_lobby.png` });

// phone
const ctxB = await browser.newContext({ viewport: { width: 760, height: 360 }, hasTouch: true });
const phone = await ctxB.newPage();
const logsB = [];
phone.on('console', (m) => logsB.push(`[B ${m.type()}] ${m.text()}`));
phone.on('pageerror', (e) => logsB.push(`[B err] ${e.message}`));

await phone.goto(`${BASE}/play/TEST?slot=0`, { waitUntil: 'networkidle' });
await phone.waitForTimeout(400);
await phone.getByText('Tap to join').click();
await phone.waitForTimeout(1400);
await phone.screenshot({ path: `${OUT}/m3_phone.png` });

const connected = await phone.locator('text=LOCAL').count();

// lobby should reflect the connection
await arena.waitForTimeout(900);
await arena.screenshot({ path: `${OUT}/m3_lobby_connected.png` });

// enter arena and drive the phone joystick to move player 0
await arena.getByText('Enter arena').click();
await arena.waitForTimeout(1000);

await phone.mouse.move(190, 190);
await phone.mouse.down();
await phone.mouse.move(210, 110, { steps: 12 });
await arena.waitForTimeout(1300);
await arena.screenshot({ path: `${OUT}/m3_arena_phone_input.png` });
await phone.mouse.up();

await browser.close();
console.log('PHONE_CONNECTED_PILL=' + connected);
console.log('--- A ---\n' + logsA.slice(-8).join('\n'));
console.log('--- B ---\n' + logsB.slice(-10).join('\n'));
