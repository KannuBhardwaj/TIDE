/**
 * Host (laptop) side of the connection. Owns the relay socket, tracks per-slot
 * phone presence/latency/haptics, buffers the latest validated input per slot,
 * and sends feedback/haptic messages back. The game reads getInput(slot).
 */
import { RelayConnection, hostCandidates, type ConnStatus, type TransportKind } from './connection';
import { toPlayerInput, type FeedbackMsg, type Msg, type Slot } from './protocol';
import { NEUTRAL_INPUT, type PlayerInput } from '../game/player';

export interface SlotState {
  connected: boolean;
  haptics: boolean;
  name?: string;
  kind: TransportKind;
  latencyMs: number; // phone-reported RTT
  lastSeq: number;
  lastInputAt: number;
}

const emptySlot = (): SlotState => ({
  connected: false,
  haptics: false,
  kind: 'UNKNOWN',
  latencyMs: 0,
  lastSeq: -1,
  lastInputAt: 0,
});

export class HostConnection {
  readonly conn: RelayConnection;
  slots: [SlotState, SlotState] = [emptySlot(), emptySlot()];
  status: ConnStatus = 'connecting';
  kind: TransportKind = 'UNKNOWN';
  onChange?: () => void;

  private inputs: [PlayerInput | null, PlayerInput | null] = [null, null];

  constructor(readonly room: string) {
    this.conn = new RelayConnection({ candidates: hostCandidates(), room, role: 'host' });
    this.conn.onMessage = (m) => this.handle(m);
    this.conn.onStatus = (s, k) => {
      this.status = s;
      this.kind = k;
      this.onChange?.();
    };
  }

  start() {
    this.conn.start();
  }
  stop() {
    this.conn.stop();
  }

  private handle(m: Msg) {
    switch (m.t) {
      case 'peer':
        if (m.event === 'join') this.slots[m.slot].connected = true;
        else {
          this.slots[m.slot] = emptySlot();
          this.inputs[m.slot] = null;
        }
        this.onChange?.();
        break;
      case 'hello':
        this.slots[m.slot].connected = true;
        this.slots[m.slot].haptics = m.haptics;
        this.slots[m.slot].name = m.name;
        if (m.kind === 'LOCAL' || m.kind === 'USB' || m.kind === 'UNKNOWN') this.slots[m.slot].kind = m.kind;
        if (typeof m.latencyMs === 'number') this.slots[m.slot].latencyMs = m.latencyMs;
        this.onChange?.();
        break;
      case 'input':
        if (m.seq > this.slots[m.slot].lastSeq) {
          this.slots[m.slot].lastSeq = m.seq;
          this.slots[m.slot].lastInputAt = performance.now();
          this.inputs[m.slot] = toPlayerInput(m);
        }
        break;
      case 'cal':
        this.slots[m.slot].latencyMs = m.latencyMs;
        this.onChange?.();
        break;
    }
  }

  /** latest input for a connected slot, or null if no phone owns it. */
  getInput(slot: Slot): PlayerInput | null {
    const s = this.slots[slot];
    if (!s.connected) return null;
    const inp = this.inputs[slot];
    if (!inp) return NEUTRAL_INPUT;
    // if the phone went quiet mid-match, idle the marker safely
    if (performance.now() - s.lastInputAt > 600) return NEUTRAL_INPUT;
    return inp;
  }

  anyConnected(): boolean {
    return this.slots.some((s) => s.connected);
  }

  sendFeedback(slot: Slot, f: Omit<FeedbackMsg, 't' | 'slot'>) {
    this.conn.send({ t: 'feedback', slot, ...f });
  }

  sendHaptic(slot: Slot, pattern: number[]) {
    this.conn.send({ t: 'haptic', slot, pattern });
  }
}
