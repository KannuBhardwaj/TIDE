import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { PhoneConnection } from '../net/phone';
import type { ConnStatus, TransportKind } from '../net/connection';
import type { Slot } from '../net/protocol';

const GOLD = '#FFC24B';
const CRIMSON = '#FF3B5C';

interface InputRef {
  joy: { x: number; y: number };
  push: boolean;
  pinch: boolean;
  wall: boolean;
}

export function PhoneController() {
  const { room = 'TIDE' } = useParams();
  const [search] = useSearchParams();
  const slotPref = (search.get('slot') === '1' ? 1 : search.get('slot') === '0' ? 0 : undefined) as
    | Slot
    | undefined;

  const [joined, setJoined] = useState(false);
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [kind, setKind] = useState<TransportKind>('UNKNOWN');
  const [latency, setLatency] = useState(0);
  const [team, setTeam] = useState<'A' | 'B'>(slotPref === 1 ? 'B' : 'A');
  const [energy, setEnergy] = useState(1);
  const [peak, setPeak] = useState(0);
  const [hapticsOk] = useState(() => typeof navigator !== 'undefined' && 'vibrate' in navigator);
  const [showWired, setShowWired] = useState(false);

  const connRef = useRef<PhoneConnection | null>(null);
  const input = useRef<InputRef>({ joy: { x: 0, y: 0 }, push: false, pinch: false, wall: false });
  const joyRef = useRef<HTMLDivElement>(null);
  const joyPointer = useRef<{ id: number; ox: number; oy: number } | null>(null);
  const [thumb, setThumb] = useState({ x: 0, y: 0 });

  const color = team === 'A' ? GOLD : CRIMSON;

  // --- join on first user gesture (unlocks fullscreen / wake lock / vibrate) ---
  async function join() {
    const simulate = search.get('fail') === '1';
    const conn = new PhoneConnection(room, slotPref, simulate ? () => true : undefined);
    conn.onStatus = (s, k, l) => {
      setStatus(s);
      setKind(k);
      setLatency(l);
      if (s === 'connected') conn.hello(hapticsOk);
    };
    conn.onWelcome = (_slot, t) => setTeam(t);
    conn.onFeedback = (f) => {
      setEnergy(f.energy);
      setPeak(f.peak ?? 0);
    };
    conn.start();
    connRef.current = conn;
    setJoined(true);

    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      /* ignore */
    }
    try {
      await navigator.wakeLock?.request('screen');
    } catch {
      /* not a secure context / unsupported */
    }
    if (hapticsOk) navigator.vibrate(20);
  }

  // --- send input at ~60Hz ---
  useEffect(() => {
    if (!joined) return;
    let raf = 0;
    const tick = () => {
      const c = connRef.current;
      const i = input.current;
      if (c) c.sendInput(i.joy, i.push, i.pinch, i.wall);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [joined]);

  // keep the lobby badge fresh (haptics + transport + latency)
  useEffect(() => {
    if (!joined) return;
    const id = setInterval(() => {
      if (connRef.current?.status === 'connected') connRef.current.hello(hapticsOk);
    }, 2000);
    return () => clearInterval(id);
  }, [joined, hapticsOk]);

  useEffect(() => () => connRef.current?.stop(), []);

  // --- floating joystick (pointer events) ---
  function onJoyDown(e: React.PointerEvent) {
    const el = joyRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    joyPointer.current = { id: e.pointerId, ox: e.clientX - r.left, oy: e.clientY - r.top };
    el.setPointerCapture(e.pointerId);
  }
  function onJoyMove(e: React.PointerEvent) {
    const jp = joyPointer.current;
    const el = joyRef.current;
    if (!jp || jp.id !== e.pointerId || !el) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - r.left - jp.ox;
    const dy = e.clientY - r.top - jp.oy;
    const max = 70;
    const len = Math.hypot(dx, dy) || 1;
    const cl = Math.min(len, max);
    const nx = (dx / len) * cl;
    const ny = (dy / len) * cl;
    setThumb({ x: nx, y: ny });
    input.current.joy = { x: nx / max, y: -ny / max }; // invert: screen-down = -y
  }
  function onJoyUp(e: React.PointerEvent) {
    if (joyPointer.current?.id !== e.pointerId) return;
    joyPointer.current = null;
    setThumb({ x: 0, y: 0 });
    input.current.joy = { x: 0, y: 0 };
  }

  const btn = (key: 'push' | 'pinch' | 'wall') => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      input.current[key] = true;
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      input.current[key] = false;
    },
    onPointerLeave: () => (input.current[key] = false),
    onPointerCancel: () => (input.current[key] = false),
  });

  if (!joined) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-abyss p-8 text-center">
        <div className="font-display text-5xl font-light tracking-[0.1em]" style={{ color }}>
          TIDE
        </div>
        <div className="label mt-3 text-pearl/40">room {room}</div>
        <button
          onClick={join}
          className="mt-10 rounded-full px-10 py-4 font-mono text-sm uppercase tracking-[0.2em]"
          style={{ background: color, color: '#04141A', boxShadow: `0 0 40px ${color}66` }}
        >
          Tap to join
        </button>
        <div className="label mt-8 text-pearl/30">rotate to landscape</div>
      </div>
    );
  }

  const peakGlow = 0.2 + peak * 0.8;

  return (
    <div
      className="relative h-full w-full touch-none overflow-hidden bg-abyss"
      style={{
        boxShadow: `inset 0 0 ${60 + peak * 120}px ${color}`,
        opacity: 1,
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* edge glow overlay reflecting the crescendo */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ boxShadow: `inset 0 0 ${40 + peak * 160}px ${color}`, opacity: peakGlow }}
      />

      {/* status bar */}
      <div className="absolute left-1/2 top-2 flex -translate-x-1/2 items-center gap-2 font-mono text-[10px]">
        <StatusPill status={status} kind={kind} latency={latency} />
        {!hapticsOk && <span className="rounded bg-white/10 px-1.5 py-0.5 text-pearl/40">no haptics</span>}
      </div>

      {status === 'failed' && (
        <div className="absolute left-1/2 top-9 -translate-x-1/2">
          <button
            onClick={() => setShowWired((s) => !s)}
            className="rounded bg-crimson/20 px-3 py-1 font-mono text-[11px] text-crimson"
          >
            Can&apos;t connect? Try wired ▾
          </button>
          {showWired && (
            <div className="mt-2 w-[280px] rounded-lg border border-white/10 bg-abyss/90 p-3 text-left text-[11px] leading-relaxed text-pearl/70">
              1. Make sure this phone is on the same hotspot as the laptop.
              <br />
              2. Or plug in via USB and run <b className="text-gold">npm run wired</b> on the laptop.
            </div>
          )}
        </div>
      )}

      {/* left: floating joystick */}
      <div
        ref={joyRef}
        onPointerDown={onJoyDown}
        onPointerMove={onJoyMove}
        onPointerUp={onJoyUp}
        onPointerCancel={onJoyUp}
        className="absolute bottom-0 left-0 top-0 w-1/2 touch-none"
      >
        <div className="absolute left-1/2 top-1/2 h-[150px] w-[150px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
        <div
          className="absolute left-1/2 top-1/2 h-[66px] w-[66px] rounded-full"
          style={{
            transform: `translate(-50%,-50%) translate(${thumb.x}px, ${thumb.y}px)`,
            background: `${color}cc`,
            boxShadow: `0 0 24px ${color}`,
          }}
        />
        <div className="label absolute bottom-6 left-1/2 -translate-x-1/2 text-pearl/25">move</div>
      </div>

      {/* energy bar (center) */}
      <div className="absolute left-1/2 bottom-3 w-[36%] -translate-x-1/2">
        <div className="h-[7px] w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-[width] duration-75"
            style={{ width: `${Math.round(energy * 100)}%`, background: color, boxShadow: `0 0 12px ${color}` }}
          />
        </div>
        <div className="label mt-1 text-center text-pearl/30">{team === 'A' ? 'gold' : 'crimson'}</div>
      </div>

      {/* right: ability buttons */}
      <div className="absolute bottom-0 right-0 top-0 flex w-1/2 touch-none items-center justify-end gap-5 pr-8">
        <AbilityButton label="PINCH" color={color} small handlers={btn('pinch')} />
        <AbilityButton label="WALL" color={color} small handlers={btn('wall')} />
        <AbilityButton label="PUSH" color={color} handlers={btn('push')} />
      </div>
    </div>
  );
}

function StatusPill({ status, kind, latency }: { status: ConnStatus; kind: TransportKind; latency: number }) {
  const map: Record<ConnStatus, { t: string; c: string }> = {
    connecting: { t: 'connecting…', c: '#EAF6F2' },
    reconnecting: { t: 'reconnecting…', c: '#FFC24B' },
    connected: { t: `${kind} · ${latency}ms`, c: '#4FE3C1' },
    failed: { t: 'disconnected', c: '#FF3B5C' },
  };
  const s = map[status];
  return (
    <span className="rounded-full px-2.5 py-0.5" style={{ background: `${s.c}22`, color: s.c }}>
      {s.t}
    </span>
  );
}

function AbilityButton({
  label,
  color,
  small,
  handlers,
}: {
  label: string;
  color: string;
  small?: boolean;
  handlers: Record<string, (e: React.PointerEvent) => void>;
}) {
  const [down, setDown] = useState(false);
  const size = small ? 88 : 128;
  return (
    <button
      {...handlers}
      onPointerDown={(e) => {
        setDown(true);
        handlers.onPointerDown(e);
      }}
      onPointerUp={(e) => {
        setDown(false);
        handlers.onPointerUp(e);
      }}
      onPointerLeave={(e) => {
        setDown(false);
        handlers.onPointerLeave?.(e);
      }}
      onPointerCancel={(e) => {
        setDown(false);
        handlers.onPointerCancel?.(e);
      }}
      className="flex items-center justify-center rounded-full font-mono text-[11px] uppercase tracking-[0.15em] touch-none"
      style={{
        width: size,
        height: size,
        color: down ? '#04141A' : color,
        background: down ? color : `${color}1a`,
        border: `1.5px solid ${color}`,
        boxShadow: down ? `0 0 34px ${color}` : `0 0 14px ${color}44`,
        transition: 'background 60ms, color 60ms, box-shadow 60ms',
      }}
    >
      {label}
    </button>
  );
}
