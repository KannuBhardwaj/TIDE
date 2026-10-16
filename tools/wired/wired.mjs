/**
 * TIDE wired mode. Connects Android phones over USB as controllers using
 * `adb reverse`, so the phone reaches the laptop's dev server + relay at
 * localhost (a secure context, so Wake Lock works). No hotspot needed.
 *
 *   npm run wired -- --room TIDE
 *
 * Prereqs on the laptop: Android platform-tools (adb) on PATH; on the phone:
 * USB debugging enabled and the "Allow USB debugging" prompt accepted.
 *
 * Steps per detected device: adb reverse the app port (5173) and relay port
 * (8787), then launch the controller via an intent. Make sure the arena is open
 * on the laptop with the SAME room, e.g. http://localhost:5173/?room=TIDE
 */
import { spawnSync } from 'node:child_process';

const APP_PORT = Number(process.env.PORT) || 5173;
const RELAY_PORT = Number(process.env.RELAY_PORT) || 8787;

const args = process.argv.slice(2);
function argVal(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const room = (argVal('--room', 'TIDE') || 'TIDE').toUpperCase();

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  gold: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

function adb(serial, cmdArgs) {
  const full = serial ? ['-s', serial, ...cmdArgs] : cmdArgs;
  return spawnSync('adb', full, { encoding: 'utf8' });
}

function fail(msg, tips) {
  console.error('\n' + c.red('✖ ' + msg));
  if (tips) for (const t of tips) console.error('  ' + c.dim('• ') + t);
  console.error('');
  process.exit(1);
}

// --- adb present? ---
const probe = spawnSync('adb', ['version'], { encoding: 'utf8' });
if (probe.error) {
  fail('adb not found on PATH.', [
    'Install Android platform-tools: https://developer.android.com/tools/releases/platform-tools',
    'Then add the platform-tools folder to your PATH and reopen the terminal.',
  ]);
}

console.log(c.cyan(`\n  TIDE wired  ·  room ${c.gold(room)}  ·  ports ${APP_PORT}/${RELAY_PORT}`));
console.log(c.dim(`  open the arena on the laptop at  http://localhost:${APP_PORT}/?room=${room}\n`));

// --- enumerate devices ---
const list = spawnSync('adb', ['devices', '-l'], { encoding: 'utf8' });
const lines = (list.stdout || '').split('\n').slice(1).map((l) => l.trim()).filter(Boolean);

const devices = [];
for (const line of lines) {
  const [serial, state] = line.split(/\s+/);
  const modelMatch = line.match(/model:(\S+)/);
  const model = modelMatch ? modelMatch[1].replace(/_/g, ' ') : 'Android device';
  devices.push({ serial, state, model });
}

const ready = devices.filter((d) => d.state === 'device');
const unauthorized = devices.filter((d) => d.state === 'unauthorized');
const offline = devices.filter((d) => d.state === 'offline');

for (const d of unauthorized) console.log(c.gold(`  ! ${d.serial} unauthorized`) + c.dim(' — accept the "Allow USB debugging" prompt on the phone'));
for (const d of offline) console.log(c.gold(`  ! ${d.serial} offline`) + c.dim(' — unplug/replug the cable'));

if (ready.length === 0) {
  fail('No ready Android devices found.', [
    'Use a DATA USB cable (charge-only cables will not work).',
    'On the phone: Settings → Developer options → enable USB debugging.',
    'Accept the "Allow USB debugging" prompt when it appears.',
    'Re-run: npm run wired -- --room ' + room,
  ]);
}

// --- reverse ports + launch, assigning slots in detection order ---
const override = argVal('--slots', null); // e.g. "1,0"
const slotOrder = override ? override.split(',').map(Number) : ready.map((_, i) => i);

let slotCursor = 0;
for (const d of ready) {
  const slot = slotOrder[slotCursor] ?? slotCursor;
  slotCursor++;
  if (slot > 1) {
    console.log(c.dim(`  skipping ${d.model} (${d.serial}) — only 2 slots`));
    continue;
  }
  console.log(`  ${c.green('›')} ${d.model} ${c.dim('(' + d.serial + ')')} → slot ${slot === 0 ? c.gold('Gold') : c.red('Crimson')}`);

  const r1 = adb(d.serial, ['reverse', `tcp:${APP_PORT}`, `tcp:${APP_PORT}`]);
  const r2 = adb(d.serial, ['reverse', `tcp:${RELAY_PORT}`, `tcp:${RELAY_PORT}`]);
  if (r1.status !== 0 || r2.status !== 0) {
    console.log(c.red('    could not reverse ports: ') + c.dim((r1.stderr || r2.stderr || '').trim()));
    continue;
  }

  const url = `http://localhost:${APP_PORT}/play/${room}?slot=${slot}&relay=localhost`;
  const launch = adb(d.serial, ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url]);
  if (launch.status !== 0) {
    console.log(c.red('    could not launch controller: ') + c.dim((launch.stderr || '').trim()));
  } else {
    console.log(c.dim(`    launched ${url}`));
  }
}

console.log(c.green('\n  done.') + c.dim(' Phones show a USB badge once connected. Re-run anytime.\n'));
