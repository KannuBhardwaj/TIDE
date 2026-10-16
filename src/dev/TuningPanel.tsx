import { useState } from 'react';
import { TUNING, getValue, setValue, type TuneField } from './tuning';
import type { GameStats } from '../game/loop';

function Slider({ field }: { field: TuneField }) {
  const [v, setV] = useState(getValue(field));
  return (
    <label className="flex items-center gap-2 py-[3px] text-[11px]">
      <span className="w-[108px] shrink-0 text-pearl/60">{field.label}</span>
      <input
        type="range"
        min={field.min}
        max={field.max}
        step={field.step}
        value={v}
        onChange={(e) => {
          const nv = parseFloat(e.target.value);
          setV(nv);
          setValue(field, nv);
        }}
        className="h-[3px] flex-1 accent-teal"
      />
      <span className="w-[46px] shrink-0 text-right font-mono text-pearl/80">
        {v.toFixed(field.step < 0.1 ? 3 : v >= 100 ? 0 : 2)}
      </span>
    </label>
  );
}

export function TuningPanel({ stats }: { stats: GameStats | null }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="pointer-events-auto absolute right-3 top-3 w-[300px] select-none rounded-xl border border-white/10 bg-abyss/70 p-3 backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between">
        <span className="label text-teal">TIDE · tuning</span>
        <button
          onClick={() => setOpen((o) => !o)}
          className="label rounded bg-white/5 px-2 py-1 hover:bg-white/10"
        >
          {open ? 'hide' : 'show'}
        </button>
      </div>

      <div className="mb-2 flex gap-4 border-b border-white/10 pb-2 font-mono text-[11px] text-pearl/70">
        <span>
          <span className="text-pearl/40">fps </span>
          <span className={stats && stats.fps < 50 ? 'text-crimson' : 'text-teal'}>
            {stats?.fps ?? '—'}
          </span>
        </span>
        <span>
          <span className="text-pearl/40">ball </span>
          {stats ? stats.ballSpeed.toFixed(2) : '—'}
        </span>
        <span>
          <span className="text-pearl/40">dbg </span>
          <span className="text-gold">{stats?.debug ?? 'off'}</span>
        </span>
      </div>

      {open && (
        <div className="max-h-[70vh] overflow-y-auto pr-1">
          {TUNING.map((g) => (
            <div key={g.title} className="mb-2">
              <div className="label mb-1 text-pearl/40">{g.title}</div>
              {g.fields.map((fld) => (
                <Slider key={`${fld.group}.${fld.key}`} field={fld} />
              ))}
            </div>
          ))}
          <div className="mt-1 border-t border-white/10 pt-2 text-[10px] leading-relaxed text-pearl/40">
            mouse drag stirs water · <b className="text-gold">`</b> cycles debug ·{' '}
            <b className="text-gold">R</b> restarts match
          </div>
        </div>
      )}
    </div>
  );
}
