/**
 * TIDE local relay. A tiny room-based WebSocket switchboard the phones and the
 * laptop (host) both connect to. Over the hotspot the phones reach it at the
 * laptop's LAN IP; over USB they reach it at localhost via `adb reverse`.
 *
 *   npm run relay            # default port 8787
 *   RELAY_PORT=9000 npm run relay
 *
 * Rooms are created on demand. The relay routes phone->host and host->phone(by
 * slot) and emits presence (peer join/leave) to the host. Payloads are opaque.
 */
import { WebSocketServer } from 'ws';
import { lanAddresses } from '../tools/start/lan.mjs';

const PORT = Number(process.env.RELAY_PORT) || 8787;
const MAX_SLOTS = 2;

/** room -> { host: ws|null, phones: Map<slot, ws> } */
const rooms = new Map();

function getRoom(id) {
  let r = rooms.get(id);
  if (!r) {
    r = { host: null, phones: new Map() };
    rooms.set(id, r);
  }
  return r;
}

function send(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function teamForSlot(slot) {
  return slot === 0 ? 'A' : 'B';
}

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws) => {
  ws.room = null;
  ws.role = null;
  ws.slot = null;

  ws.on('message', (data) => {
    let m;
    try {
      m = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'ping') {
      send(ws, { t: 'pong', id: m.id });
      return;
    }
    if (m.t === 'join') {
      handleJoin(ws, m);
      return;
    }
    route(ws, m, data.toString());
  });

  ws.on('close', () => handleClose(ws));
  ws.on('error', () => {});
});

function handleJoin(ws, m) {
  if (typeof m.room !== 'string') return;
  const room = getRoom(m.room);
  ws.room = m.room;
  ws.role = m.role;

  if (m.role === 'host') {
    // replace any stale host
    room.host = ws;
    // tell the (re)connected host which phones are already present
    for (const slot of room.phones.keys()) send(ws, { t: 'peer', event: 'join', slot });
    return;
  }

  // phone: honor requested slot if free, else take the first free one
  let slot = m.slot === 0 || m.slot === 1 ? m.slot : null;
  if (slot === null || room.phones.has(slot)) {
    slot = null;
    for (let s = 0; s < MAX_SLOTS; s++) {
      if (!room.phones.has(s)) {
        slot = s;
        break;
      }
    }
  }
  if (slot === null) {
    send(ws, { t: 'full' });
    ws.close();
    return;
  }
  ws.slot = slot;
  room.phones.set(slot, ws);
  // provisional welcome so the phone knows its slot/team immediately
  send(ws, { t: 'welcome', slot, team: teamForSlot(slot) });
  send(room.host, { t: 'peer', event: 'join', slot });
}

function route(ws, m, raw) {
  if (!ws.room) return;
  const room = rooms.get(ws.room);
  if (!room) return;
  if (ws.role === 'phone') {
    // phones only talk to the host
    if (room.host && room.host.readyState === room.host.OPEN) room.host.send(raw);
  } else if (ws.role === 'host') {
    // host messages are addressed to a slot
    const target = room.phones.get(m.slot);
    if (target && target.readyState === target.OPEN) target.send(raw);
  }
}

function handleClose(ws) {
  if (!ws.room) return;
  const room = rooms.get(ws.room);
  if (!room) return;
  if (ws.role === 'host' && room.host === ws) {
    room.host = null;
  } else if (ws.role === 'phone' && ws.slot !== null && room.phones.get(ws.slot) === ws) {
    room.phones.delete(ws.slot);
    send(room.host, { t: 'peer', event: 'leave', slot: ws.slot });
  }
  if (!room.host && room.phones.size === 0) rooms.delete(ws.room);
}

console.log(`\n  TIDE relay listening on :${PORT}`);
console.log(`  host    ws://localhost:${PORT}`);
for (const ip of lanAddresses()) console.log(`  hotspot ws://${ip}:${PORT}`);
console.log('');
