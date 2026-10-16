/**
 * Wire protocol between the laptop (host, authoritative) and the phones.
 * Small JSON messages, validated at runtime on both ends. The relay routes by
 * room + role and otherwise treats payloads as opaque.
 */
import type { PlayerInput } from '../game/player';

export const RELAY_PORT = 8787;
export const MAX_SLOTS = 2;

export type Slot = 0 | 1;
export type Role = 'host' | 'phone';

// --- control / relay ---
export interface JoinMsg {
  t: 'join';
  room: string;
  role: Role;
  slot?: Slot;
}
export interface PingMsg {
  t: 'ping';
  id: number;
}
export interface PongMsg {
  t: 'pong';
  id: number;
}
/** relay -> host when a phone joins/leaves a slot. */
export interface PeerMsg {
  t: 'peer';
  event: 'join' | 'leave';
  slot: Slot;
}

// --- phone -> host ---
export interface HelloMsg {
  t: 'hello';
  slot: Slot;
  name?: string;
  haptics: boolean;
  kind?: string; // phone's transport path (LOCAL / USB)
  latencyMs?: number; // phone<->relay RTT
}
export interface InputMsg {
  t: 'input';
  slot: Slot;
  joy: { x: number; y: number };
  push: boolean;
  pinch: boolean;
  wall: boolean;
  seq: number;
  ts: number;
}
export interface CalMsg {
  t: 'cal';
  slot: Slot;
  latencyMs: number;
}

// --- host -> phone ---
export interface WelcomeMsg {
  t: 'welcome';
  slot: Slot;
  team: 'A' | 'B';
}
export interface FeedbackMsg {
  t: 'feedback';
  slot: Slot;
  energy: number;
  wall: boolean;
  pushReady: boolean;
  score: { a: number; b: number };
  peak: number; // crescendo intensity 0..1 (M4)
  state: string;
}
export interface HapticMsg {
  t: 'haptic';
  slot: Slot;
  pattern: number[];
}

export type Msg =
  | JoinMsg
  | PingMsg
  | PongMsg
  | PeerMsg
  | HelloMsg
  | InputMsg
  | CalMsg
  | WelcomeMsg
  | FeedbackMsg
  | HapticMsg;

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const bool = (v: unknown): v is boolean => typeof v === 'boolean';
const slotOk = (v: unknown): v is Slot => v === 0 || v === 1;

/** structural validation; returns the typed message or null if malformed. */
export function validate(o: Record<string, unknown>): Msg | null {
  switch (o.t) {
    case 'join':
      return typeof o.room === 'string' && (o.role === 'host' || o.role === 'phone') ? (o as unknown as JoinMsg) : null;
    case 'ping':
    case 'pong':
      return num(o.id) ? (o as unknown as Msg) : null;
    case 'peer':
      return (o.event === 'join' || o.event === 'leave') && slotOk(o.slot) ? (o as unknown as PeerMsg) : null;
    case 'hello':
      return slotOk(o.slot) && bool(o.haptics) ? (o as unknown as HelloMsg) : null;
    case 'input': {
      const j = o.joy as { x: unknown; y: unknown } | undefined;
      return slotOk(o.slot) && j != null && num(j.x) && num(j.y) && bool(o.push) && bool(o.pinch) && bool(o.wall) && num(o.seq)
        ? (o as unknown as InputMsg)
        : null;
    }
    case 'cal':
      return slotOk(o.slot) && num(o.latencyMs) ? (o as unknown as CalMsg) : null;
    case 'welcome':
      return slotOk(o.slot) && (o.team === 'A' || o.team === 'B') ? (o as unknown as WelcomeMsg) : null;
    case 'feedback':
      return slotOk(o.slot) && num(o.energy) ? (o as unknown as FeedbackMsg) : null;
    case 'haptic':
      return slotOk(o.slot) && Array.isArray(o.pattern) ? (o as unknown as HapticMsg) : null;
    default:
      return null;
  }
}

export function parseMsg(data: string): Msg | null {
  try {
    const o = JSON.parse(data);
    if (!o || typeof o !== 'object' || typeof o.t !== 'string') return null;
    return validate(o as Record<string, unknown>);
  } catch {
    return null;
  }
}

const clamp1 = (v: number) => (v < -1 ? -1 : v > 1 ? 1 : v);

/** convert a validated input message into the game's PlayerInput. */
export function toPlayerInput(m: InputMsg): PlayerInput {
  return {
    joystick: { x: clamp1(m.joy.x), y: clamp1(m.joy.y) },
    push: m.push,
    pinch: m.pinch,
    wall: m.wall,
  };
}
