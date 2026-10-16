/**
 * RelayConnection — the single transport implementation (a resilient WebSocket
 * client to the relay) plus candidate selection and auto-reconnect. There is no
 * cloud backend: the two "transports" are really two network paths to the same
 * relay — the laptop LAN IP over the hotspot (LOCAL) or localhost via adb
 * reverse (USB). The manager tries candidates in order and reconnects.
 */
import { RELAY_PORT, parseMsg, type Msg, type Role, type Slot } from './protocol';

export type ConnStatus = 'connecting' | 'connected' | 'reconnecting' | 'failed';
export type TransportKind = 'LOCAL' | 'USB' | 'UNKNOWN';

export interface Candidate {
  url: string;
  kind: TransportKind;
}

export interface ConnOptions {
  candidates: Candidate[];
  room: string;
  role: Role;
  slot?: Slot;
  /** when true, all connection attempts fail (dev "simulate failure"). */
  simulateFailure?: () => boolean;
}

const CONNECT_TIMEOUT = 2500;
const RECONNECT_DELAY = 1200;
const PING_INTERVAL = 2000;

export class RelayConnection {
  status: ConnStatus = 'connecting';
  kind: TransportKind = 'UNKNOWN';
  latency = 0;

  onMessage?: (m: Msg) => void;
  onStatus?: (s: ConnStatus, kind: TransportKind, latency: number) => void;

  private opts: ConnOptions;
  private ws: WebSocket | null = null;
  private idx = 0;
  private stopped = false;
  private connectTimer?: ReturnType<typeof setTimeout>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private pingTimer?: ReturnType<typeof setInterval>;
  private pingId = 0;
  private pingSentAt = 0;
  private everConnected = false;

  constructor(opts: ConnOptions) {
    this.opts = opts;
  }

  start() {
    this.stopped = false;
    this.idx = 0;
    this.tryNext();
  }

  stop() {
    this.stopped = true;
    this.clearTimers();
    this.ws?.close();
    this.ws = null;
  }

  send(obj: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  private setStatus(s: ConnStatus) {
    this.status = s;
    this.onStatus?.(s, this.kind, this.latency);
  }

  private tryNext() {
    if (this.stopped) return;
    if (this.opts.simulateFailure?.()) {
      this.fail();
      return;
    }
    if (this.idx >= this.opts.candidates.length) {
      // exhausted: either keep retrying from the top (if we had a connection)
      // or report failure.
      if (this.everConnected) {
        this.idx = 0;
        this.setStatus('reconnecting');
        this.reconnectTimer = setTimeout(() => this.tryNext(), RECONNECT_DELAY);
      } else {
        this.fail();
      }
      return;
    }

    const cand = this.opts.candidates[this.idx];
    this.setStatus(this.everConnected ? 'reconnecting' : 'connecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(cand.url);
    } catch {
      this.idx++;
      this.tryNext();
      return;
    }
    this.ws = ws;

    this.connectTimer = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        ws.close();
        this.idx++;
        this.tryNext();
      }
    }, CONNECT_TIMEOUT);

    ws.onopen = () => {
      clearTimeout(this.connectTimer);
      this.kind = cand.kind;
      this.everConnected = true;
      this.setStatus('connected');
      this.send({ t: 'join', room: this.opts.room, role: this.opts.role, slot: this.opts.slot });
      this.startPing();
    };

    ws.onmessage = (ev) => {
      const data = typeof ev.data === 'string' ? ev.data : '';
      // intercept pong for latency
      try {
        const o = JSON.parse(data);
        if (o && o.t === 'pong' && o.id === this.pingId) {
          this.latency = Math.round(performance.now() - this.pingSentAt);
          this.onStatus?.(this.status, this.kind, this.latency);
          return;
        }
      } catch {
        /* fall through to parseMsg */
      }
      const m = parseMsg(data);
      if (m) this.onMessage?.(m);
    };

    const onDrop = () => {
      clearTimeout(this.connectTimer);
      this.clearPing();
      if (this.stopped) return;
      // connected then dropped -> reconnect from the top; else try next candidate
      if (this.status === 'connected') {
        this.idx = 0;
        this.setStatus('reconnecting');
        this.reconnectTimer = setTimeout(() => this.tryNext(), RECONNECT_DELAY);
      } else {
        this.idx++;
        this.tryNext();
      }
    };
    ws.onclose = onDrop;
    ws.onerror = () => ws.close();
  }

  private fail() {
    this.clearTimers();
    this.setStatus('failed');
    // keep retrying slowly so recovery is automatic once the path is fixed
    this.reconnectTimer = setTimeout(() => {
      this.everConnected = false;
      this.idx = 0;
      this.tryNext();
    }, RECONNECT_DELAY * 2);
  }

  private startPing() {
    this.clearPing();
    const ping = () => {
      this.pingId++;
      this.pingSentAt = performance.now();
      this.send({ t: 'ping', id: this.pingId });
    };
    ping();
    this.pingTimer = setInterval(ping, PING_INTERVAL);
  }

  private clearPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = undefined;
  }

  private clearTimers() {
    clearTimeout(this.connectTimer);
    clearTimeout(this.reconnectTimer);
    this.clearPing();
  }
}

function dedupe(list: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return list.filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)));
}

/** candidate relay URLs for a phone, derived from how the page was reached. */
export function phoneCandidates(search: URLSearchParams): Candidate[] {
  const host = location.hostname || 'localhost';
  const port = search.get('relayPort') || String(RELAY_PORT);
  const local = host === 'localhost' || host === '127.0.0.1';
  const list: Candidate[] = [];
  const param = search.get('relay');
  if (param) {
    const url = param.includes(':') ? `ws://${param}` : `ws://${param}:${port}`;
    const kind: TransportKind = /^(localhost|127\.)/.test(param) ? 'USB' : 'LOCAL';
    list.push({ url, kind });
  }
  list.push({ url: `ws://${host}:${port}`, kind: local ? 'USB' : 'LOCAL' });
  return dedupe(list);
}

/** the host (laptop) always reaches the relay on localhost. */
export function hostCandidates(): Candidate[] {
  return [{ url: `ws://localhost:${RELAY_PORT}`, kind: 'LOCAL' }];
}
