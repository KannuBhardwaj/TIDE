import { useEffect, useRef, useState } from 'react';
import { qrDataUrl } from './qr';
import type { HostConnection, SlotState } from '../net/host';
import type { Slot } from '../net/protocol';

const GOLD = '#FFC24B';
const CRIMSON = '#FF3B5C';
const TEAMS: { slot: Slot; name: string; color: string }[] = [
  { slot: 0, name: 'Gold', color: GOLD },
  { slot: 1, name: 'Crimson', color: CRIMSON },
];

function QrImg({ text }: { text: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let live = true;
    qrDataUrl(text).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [text]);
  return url ? (
    <img src={url} alt="scan to join" className="h-[150px] w-[150px] rounded-lg" />
  ) : (
    <div className="h-[150px] w-[150px] rounded-lg bg-white/5" />
  );
}

function SlotCard({
  name,
  color,
  state,
  phoneUrl,
  room,
  simOn,
  onToggleSim,
}: {
  name: string;
  color: string;
  state: SlotState;
  phoneUrl: string;
  room: string;
  simOn: boolean;
  onToggleSim: () => void;
}) {
  const badge = state.connected
    ? `${state.kind === 'UNKNOWN' ? 'LOCAL' : state.kind} · ${state.latencyMs}ms`
    : 'waiting';
  return (
    <div
      className="flex w-[300px] flex-col items-center rounded-2xl border p-5"
      style={{ borderColor: `${color}44`, background: `${color}0a` }}
    >
      <div className="label mb-3" style={{ color }}>
        {name}
      </div>
      {state.connected ? (
        <div
          className="flex h-[150px] w-[150px] flex-col items-center justify-center rounded-lg"
          style={{ background: `${color}14`, border: `1px solid ${color}55` }}
        >
          <div className="text-3xl" style={{ color }}>
            ●
          </div>
          <div className="label mt-2" style={{ color }}>
            connected
          </div>
        </div>
      ) : (
        <QrImg text={phoneUrl} />
      )}

      <div className="mt-3 flex items-center gap-2 font-mono text-[11px]">
        <span
          className="rounded-full px-2 py-0.5"
          style={{
            background: state.connected ? `${color}22` : 'rgba(255,255,255,0.06)',
            color: state.connected ? color : '#EAF6F2a0',
          }}
        >
          {badge}
        </span>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-pearl/40">
          {state.haptics ? 'haptics ✓' : 'no haptics'}
        </span>
      </div>

      <div className="mt-3 text-center">
        <div className="label text-pearl/30">room code</div>
        <div className="font-mono text-2xl tracking-[0.3em] text-pearl">{room}</div>
      </div>
      <div className="mt-1 break-all px-2 text-center font-mono text-[9px] text-pearl/25">{phoneUrl}</div>

      <button
        onClick={onToggleSim}
        className="mt-3 rounded-md border border-white/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-pearl/50 hover:bg-white/5"
      >
        {simOn ? 'stop sim phone' : 'add sim phone (dev)'}
      </button>
    </div>
  );
}

function Calibration() {
  const [taps, setTaps] = useState<number[]>([]);
  const [offset, setOffset] = useState<number | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const beatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const beatAt = useRef<number[]>([]);

  function beep(ctx: AudioContext) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.13);
  }

  function run() {
    const ctx = audio.current ?? new AudioContext();
    audio.current = ctx;
    ctx.resume();
    setTaps([]);
    setOffset(null);
    beatAt.current = [];
    let n = 0;
    const interval = 600;
    const fire = () => {
      beatAt.current.push(performance.now());
      beep(ctx);
      n++;
      if (n >= 6 && beatTimer.current) {
        clearInterval(beatTimer.current);
        beatTimer.current = null;
      }
    };
    fire();
    beatTimer.current = setInterval(fire, interval);
  }

  function tap() {
    const beats = beatAt.current;
    if (beats.length === 0) return;
    const now = performance.now();
    // offset to the nearest scheduled beat
    let best = Infinity;
    for (const b of beats) {
      const d = now - b;
      if (Math.abs(d) < Math.abs(best)) best = d;
    }
    const next = [...taps, best].slice(-6);
    setTaps(next);
    const avg = Math.round(next.reduce((a, b) => a + b, 0) / next.length);
    setOffset(avg);
    try {
      localStorage.setItem('tide.calibration', String(avg));
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={run}
        className="rounded-md border border-teal/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-teal hover:bg-teal/10"
      >
        play beat
      </button>
      <button
        onClick={tap}
        className="rounded-md border border-white/15 px-5 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-pearl/70 hover:bg-white/5"
      >
        tap
      </button>
      <span className="font-mono text-[11px] text-pearl/50">
        {offset === null ? 'tap on each beep' : `offset ${offset > 0 ? '+' : ''}${offset}ms`}
      </span>
    </div>
  );
}

export function Lobby({
  room,
  host,
  onStart,
  sims,
  onToggleSim,
}: {
  room: string;
  host: HostConnection;
  onStart: () => void;
  sims: [boolean, boolean];
  onToggleSim: (slot: Slot) => void;
}) {
  const [, setTick] = useState(0);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    host.onChange = () => setTick((t) => t + 1);
    return () => {
      host.onChange = undefined;
    };
  }, [host]);

  const origin = location.origin;
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const phoneUrl = (slot: Slot) => `${origin}/play/${room}?slot=${slot}`;

  return (
    <div className="relative flex h-full w-full flex-col items-center overflow-y-auto bg-abyss px-8 py-10">
      <div className="font-display text-4xl font-light tracking-[0.08em] text-pearl">LOBBY</div>
      <div className="label mt-2 text-pearl/40">scan a code with your phone camera to join</div>

      <div className="mt-8 flex flex-wrap items-start justify-center gap-6">
        {TEAMS.map((t) => (
          <SlotCard
            key={t.slot}
            name={t.name}
            color={t.color}
            state={host.slots[t.slot]}
            phoneUrl={phoneUrl(t.slot)}
            room={room}
            simOn={sims[t.slot]}
            onToggleSim={() => onToggleSim(t.slot)}
          />
        ))}
      </div>

      {/* relay / connection status */}
      <div className="mt-6 flex items-center gap-4 font-mono text-[11px] text-pearl/50">
        <span>
          relay:{' '}
          <span className={host.status === 'connected' ? 'text-teal' : 'text-crimson'}>
            {host.status === 'connected' ? 'online' : host.status}
          </span>
        </span>
        <span className="text-pearl/25">|</span>
        <span>calibrate:</span>
        <Calibration />
      </div>

      {isLocal && (
        <div className="mt-4 max-w-xl rounded-lg border border-gold/30 bg-gold/5 p-3 text-center text-[11px] text-gold/90">
          You opened the arena at <b>localhost</b>. Phones on the hotspot can&apos;t reach that — open
          the arena at the laptop&apos;s LAN address (shown when you run <b>npm run dev</b>), or use
          USB via <b>npm run wired</b>.
        </div>
      )}

      <div className="mt-8 flex items-center gap-4">
        <button
          onClick={onStart}
          className="rounded-full border border-teal/50 px-10 py-3 font-mono text-sm uppercase tracking-[0.2em] text-teal hover:bg-teal/10"
          style={{ boxShadow: '0 0 30px #4FE3C122' }}
        >
          Enter arena
        </button>
        <button
          onClick={() => setHelp((h) => !h)}
          className="rounded-full border border-white/15 px-6 py-3 font-mono text-xs uppercase tracking-[0.15em] text-pearl/60 hover:bg-white/5"
        >
          Can&apos;t connect?
        </button>
      </div>

      {help && (
        <div className="mt-5 max-w-xl rounded-xl border border-white/10 bg-white/5 p-5 text-[12px] leading-relaxed text-pearl/70">
          <div className="label mb-2 text-teal">connection help</div>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Put both phones and the laptop on the <b>same hotspot</b>, then open the arena at the
              laptop&apos;s LAN address and scan the codes.
            </li>
            <li>
              If the venue Wi-Fi blocks device-to-device traffic, create a hotspot on the laptop or a
              phone and have everyone join it.
            </li>
            <li>
              <b>USB fallback:</b> plug an Android phone into the laptop, enable USB debugging, and run{' '}
              <b className="text-gold">npm run wired</b>. It reverse-maps the ports and launches the
              controller over the cable (badge shows <b>USB</b>). Works with two phones.
            </li>
          </ol>
          <div className="mt-3 text-pearl/40">
            No phone? Use <b>add sim phone (dev)</b> on a slot and play with the keyboard.
          </div>
        </div>
      )}
    </div>
  );
}
