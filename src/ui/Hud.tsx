import type { GameStats } from '../game/loop';

function EnergyBar({
  label,
  energy,
  wall,
  color,
  align,
}: {
  label: string;
  energy: number;
  wall: boolean;
  color: string;
  align: 'left' | 'right';
}) {
  return (
    <div className={`flex w-[200px] flex-col gap-1 ${align === 'right' ? 'items-end' : 'items-start'}`}>
      <div className="flex items-center gap-2">
        <span className="label" style={{ color }}>
          {label}
        </span>
        {wall && (
          <span
            className="label rounded px-1 py-[1px] text-[8px]"
            style={{ background: `${color}22`, color }}
          >
            WALL
          </span>
        )}
      </div>
      <div className="h-[6px] w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-[width] duration-100"
          style={{
            width: `${Math.round(energy * 100)}%`,
            background: color,
            boxShadow: `0 0 10px ${color}`,
            marginLeft: align === 'right' ? 'auto' : 0,
          }}
        />
      </div>
    </div>
  );
}

export function Hud({ stats }: { stats: GameStats | null }) {
  if (!stats) return null;
  const { score, state, winner } = stats;
  const gold = '#FFC24B';
  const crimson = '#FF3B5C';

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* score */}
      <div className="absolute left-1/2 top-5 -translate-x-1/2">
        <div className="flex items-center gap-5 font-mono text-4xl font-bold tabular-nums">
          <span style={{ color: gold, textShadow: `0 0 20px ${gold}66` }}>{score.a}</span>
          <span className="text-pearl/30 text-2xl">—</span>
          <span style={{ color: crimson, textShadow: `0 0 20px ${crimson}66` }}>{score.b}</span>
        </div>
        <div className="label mt-1 text-center text-pearl/35">first to 5</div>
      </div>

      {/* energy bars */}
      <div className="absolute bottom-5 left-6">
        <EnergyBar label="Gold" energy={stats.players[0].energy} wall={stats.players[0].wall} color={gold} align="left" />
      </div>
      <div className="absolute bottom-5 right-6">
        <EnergyBar label="Crimson" energy={stats.players[1].energy} wall={stats.players[1].wall} color={crimson} align="right" />
      </div>

      {/* controls hint */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-center text-[10px] leading-relaxed text-pearl/30">
        <span style={{ color: gold }}>GOLD</span> WASD · Space push · Q pinch · E wall&nbsp;&nbsp;|&nbsp;&nbsp;
        <span style={{ color: crimson }}>CRIMSON</span> Arrows · / push · . pinch · , wall
      </div>

      {/* goal flash */}
      {state === 'goal' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="animate-pulse font-display text-7xl font-light tracking-[0.1em]"
            style={{
              color: stats.lastScorer === 'A' ? gold : stats.lastScorer === 'B' ? crimson : '#EAF6F2',
              textShadow: `0 0 50px ${stats.lastScorer === 'A' ? gold : crimson}88`,
            }}
          >
            GOAL
          </div>
        </div>
      )}

      {/* win screen */}
      {state === 'ended' && winner && (
        <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center bg-abyss/70 backdrop-blur-sm">
          <div className="label mb-3 text-pearl/50">match complete</div>
          <div
            className="font-display text-6xl font-light tracking-[0.08em]"
            style={{
              color: winner === 'A' ? gold : crimson,
              textShadow: `0 0 40px ${winner === 'A' ? gold : crimson}66`,
            }}
          >
            {winner === 'A' ? 'GOLD' : 'CRIMSON'} WINS
          </div>
          <div className="mt-6 font-mono text-lg text-pearl/70">
            {score.a} — {score.b}
          </div>
          <div className="label mt-8 text-pearl/40">press R to play again</div>
        </div>
      )}
    </div>
  );
}
