/**
 * TIDE one-command launcher: preflight checks, then the relay + the Vite app
 * in one terminal. Ctrl+C stops both.
 *
 *   npm start                 # dev server + relay, opens the arena in a browser
 *   npm start -- --no-open    # don't open a browser
 *   npm start -- --prod       # build, then serve the production bundle instead
 *
 * Plain Node (no deps) so it can run `npm install` itself on a fresh clone.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import net from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const APP_PORT = 5173;
const RELAY_PORT = Number(process.env.RELAY_PORT) || 8787;
const args = process.argv.slice(2);
const prod = args.includes('--prod');
const open = !args.includes('--no-open');
const isWin = process.platform === 'win32';

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  teal: (s) => `\x1b[36m${s}\x1b[0m`,
  gold: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function fail(msg, tips = []) {
  console.error('\n' + c.red('✖ ' + msg));
  for (const t of tips) console.error('  ' + c.dim('• ') + t);
  console.error('');
  process.exit(1);
}

function step(msg) {
  console.log(c.teal('  › ') + msg);
}

/** run an npm script / command synchronously, inheriting stdio. */
function npm(...cmd) {
  const r = spawnSync(isWin ? 'npm.cmd' : 'npm', cmd, { cwd: ROOT, stdio: 'inherit', shell: isWin });
  if (r.status !== 0) fail(`npm ${cmd.join(' ')} failed.`);
}

function listenable(port, host) {
  return new Promise((res) => {
    const srv = net.createServer();
    // no IPv6 on this box is fine; anything else (EADDRINUSE, EACCES) means taken
    srv.once('error', (e) => res(e.code === 'EADDRNOTAVAIL' || e.code === 'EAFNOSUPPORT'));
    srv.once('listening', () => srv.close(() => res(true)));
    srv.listen(port, host);
  });
}

/**
 * Check every address separately: another dev server bound only to [::1] would
 * not block a wildcard listen, yet the browser's "localhost" would hit it.
 */
async function portFree(port) {
  for (const host of ['::', '0.0.0.0', '127.0.0.1', '::1']) {
    if (!(await listenable(port, host))) return false;
  }
  return true;
}

// --- preflight ---------------------------------------------------------------
console.log(c.bold(c.teal('\n  TIDE')) + c.dim('  ·  move the water, not the ball\n'));

const major = Number(process.versions.node.split('.')[0]);
if (major < 20) {
  fail(`Node ${process.versions.node} is too old — TIDE needs Node 20 or newer.`, [
    'Install the LTS from https://nodejs.org (or `winget install OpenJS.NodeJS.LTS`), then reopen the terminal.',
  ]);
}

if (!existsSync(resolve(ROOT, 'node_modules/vite/bin/vite.js'))) {
  step('first run — installing dependencies (one-time, ~1 min)…');
  npm('install');
}

const tracksDir = resolve(ROOT, 'public/tracks');
const hasTracks = existsSync(tracksDir) && readdirSync(tracksDir).some((f) => f.endsWith('.json'));
if (!hasTracks) {
  step('no tracks found — generating procedural placeholder tracks…');
  npm('run', 'gen-track');
}

const [appFree, relayFree] = await Promise.all([portFree(APP_PORT), portFree(RELAY_PORT)]);
if (!appFree) {
  fail(`Port ${APP_PORT} is already in use.`, [
    'Another TIDE / Vite dev server is probably running — stop it (Ctrl+C in its terminal) and retry.',
    isWin
      ? `Find it:  Get-NetTCPConnection -LocalPort ${APP_PORT} -State Listen | Select OwningProcess`
      : `Find it:  lsof -i :${APP_PORT}`,
  ]);
}

if (prod) {
  step('building production bundle…');
  npm('run', 'build');
}

// --- launch ------------------------------------------------------------------
const { lanAddresses } = await import('./lan.mjs');
const ips = lanAddresses();
const children = [];

function launch(label, color, script, scriptArgs) {
  const child = spawn(process.execPath, [script, ...scriptArgs], { cwd: ROOT, env: process.env });
  const tag = color(label.padEnd(6));
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const l of lines) if (l.trim()) out.write(`${tag}${c.dim('│')} ${l}\n`);
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (shuttingDown) return;
    console.error(c.red(`\n  ${label} exited (code ${code}) — stopping.`));
    shutdown(code ?? 1);
  });
  children.push(child);
}

let shuttingDown = false;
function shutdown(code = 0) {
  shuttingDown = true;
  for (const ch of children) ch.kill();
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

if (relayFree) launch('relay', c.gold, 'relay/server.mjs', []);
else step(c.dim(`relay port ${RELAY_PORT} busy — assuming a relay is already running, reusing it`));

const vite = resolve(ROOT, 'node_modules/vite/bin/vite.js');
launch('app', c.teal, vite, [prod ? 'preview' : 'dev', ...(open ? ['--open'] : [])]);

const room = 'TIDE';
console.log('');
console.log(`  ${c.bold('Arena (this laptop)')}   http://localhost:${APP_PORT}/`);
if (ips[0]) {
  console.log(`  ${c.bold('Phones (same network)')} scan the QR codes in the lobby  ${c.dim(`(served from http://${ips[0]}:${APP_PORT})`)}`);
} else {
  console.log(c.gold('  ! no LAN address — connect to a hotspot for phones, or use USB: ') + 'npm run wired');
}
console.log(`  ${c.bold('USB phones')}            npm run wired -- --room ${room}   ${c.dim(`(arena at http://localhost:${APP_PORT}/?room=${room})`)}`);
console.log(`  ${c.bold('No phones?')}            lobby → "add sim phone" on each slot, play on the keyboard`);
console.log(c.dim('\n  Ctrl+C to stop.\n'));
