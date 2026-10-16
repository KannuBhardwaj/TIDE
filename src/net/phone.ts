/**
 * Phone side of the connection. Wraps a RelayConnection, learns its slot/team
 * from the host's welcome, forwards inputs at ~60Hz, surfaces feedback, and
 * fires haptics from host-driven haptic messages.
 */
import { RelayConnection, phoneCandidates, type ConnStatus, type TransportKind } from './connection';
import { type FeedbackMsg, type Slot, type Msg } from './protocol';

export class PhoneConnection {
  readonly conn: RelayConnection;
  slot: Slot;
  team: 'A' | 'B' = 'A';
  status: ConnStatus = 'connecting';
  kind: TransportKind = 'UNKNOWN';
  latency = 0;

  onFeedback?: (f: FeedbackMsg) => void;
  onWelcome?: (slot: Slot, team: 'A' | 'B') => void;
  onStatus?: (s: ConnStatus, kind: TransportKind, latency: number) => void;

  private seq = 0;

  constructor(room: string, slotPref: Slot | undefined, simulateFailure?: () => boolean) {
    this.slot = slotPref ?? 0;
    this.conn = new RelayConnection({
      candidates: phoneCandidates(new URLSearchParams(location.search)),
      room,
      role: 'phone',
      slot: slotPref,
      simulateFailure,
    });
    this.conn.onMessage = (m: Msg) => {
      if (m.t === 'welcome') {
        this.slot = m.slot;
        this.team = m.team;
        this.onWelcome?.(m.slot, m.team);
      } else if (m.t === 'feedback') {
        this.onFeedback?.(m);
      } else if (m.t === 'haptic') {
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(m.pattern);
      }
    };
    this.conn.onStatus = (s, k, l) => {
      this.status = s;
      this.kind = k;
      this.latency = l;
      this.onStatus?.(s, k, l);
    };
  }

  start() {
    this.conn.start();
  }
  stop() {
    this.conn.stop();
  }

  hello(haptics: boolean, name?: string) {
    this.conn.send({
      t: 'hello',
      slot: this.slot,
      haptics,
      name,
      kind: this.kind,
      latencyMs: this.latency,
    });
  }

  sendInput(joy: { x: number; y: number }, push: boolean, pinch: boolean, wall: boolean) {
    this.conn.send({ t: 'input', slot: this.slot, joy, push, pinch, wall, seq: this.seq++, ts: Date.now() });
  }

  sendCal(latencyMs: number) {
    this.conn.send({ t: 'cal', slot: this.slot, latencyMs });
  }
}
