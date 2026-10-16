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

const GRADE_COLOR: Record<string, string> = {
  perfect: '#FFC9A3',
  great: '#4FE3C1',
  good: '#EAF6F2',
};

export function Hud({ stats }: { stats: GameStats | null }) {
  if (!stats) return null;
  const { score, state, result } = stats;
  const gold = '#FFC24B';
  const crimson = '#FF3B5C';

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* score + track + crescendo meter */}
      <div className="absolute left-1/2 top-5 -translate-x-1/2 flex flex-col items-center">
        <div className="flex items-center gap-5 font-mono text-4xl font-bold tabular-nums">
          <span style={{ color: gold, textShadow: `0 0 20px ${gold}66` }}>{score.a}</span>
          <span className="text-pearl/30 text-2xl">—</span>
          <span style={{ color: crimson, textShadow: `0 0 20px ${crimson}66` }}>{score.b}</span>
        </div>
        <div className="label mt-1 text-pearl/35">
          {stats.trackTitle ? `${stats.trackTitle} · first to 5` : 'first to 5'}
        </div>
        {/* crescendo meter */}
        <div className="mt-2 h-[3px] w-[180px] overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.round(stats.glow * 100)}%`,
              background: '#FFC9A3',
              boxShadow: '0 0 12px #FFC9A3',
            }}
          />
        </div>
        {stats.power > 1.08 && (
          <div className="label mt-1" style={{ color: '#FFC9A3' }}>
            ×{stats.power.toFixed(2)} power
          </div>
        )}
      </div>

      {/* timing-grade flash */}
      {stats.grade !== 'none' && stats.gradeSlot !== null && (
        <div
          className="absolute left-1/2 top-[22%] -translate-x-1/2 font-display text-5xl font-light tracking-[0.08em]"
          style={{ color: GRADE_COLOR[stats.grade] ?? '#EAF6F2', textShadow: `0 0 30px ${GRADE_COLOR[stats.grade]}aa` }}
        >
          {stats.grade.toUpperCase()}
        </div>
      )}

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

      {/* goal shatter + countdown */}
      {state === 'goal' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {stats.countdown > 0 ? (
            <div
              key={stats.countdown}
              className="font-display text-[140px] font-light leading-none"
              style={{ color: '#FFC9A3', textShadow: '0 0 60px #FFC9A3aa' }}
            >
              {stats.countdown}
            </div>
          ) : (
            <>
              <div
                className="font-display text-6xl font-light tracking-[0.1em]"
                style={{
                  color: stats.lastScorer === 'A' ? gold : stats.lastScorer === 'B' ? crimson : '#EAF6F2',
                  textShadow: `0 0 50px ${stats.lastScorer === 'A' ? gold : crimson}88`,
                }}
              >
                GOAL
              </div>
              <div className="label mt-3 text-pearl/60">drag the shards with your joystick</div>
              {stats.shatterCountdown > 0 && (
                <div
                  key={stats.shatterCountdown}
                  className="mt-4 font-mono text-5xl font-bold tabular-nums"
                  style={{ color: '#4FE3C1', textShadow: '0 0 30px #4FE3C1aa' }}
                >
                  {stats.shatterCountdown}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* win screen */}
      {state === 'ended' && result && (
        <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center bg-abyss/70 backdrop-blur-sm">
          <div className="label mb-3 text-pearl/50">match complete</div>
          <div
            className="font-display text-6xl font-light tracking-[0.08em]"
            style={{
              color: result === 'A' ? gold : result === 'B' ? crimson : '#EAF6F2',
              textShadow: `0 0 40px ${result === 'A' ? gold : result === 'B' ? crimson : '#EAF6F2'}66`,
            }}
          >
            {result === 'A' ? 'GOLD WINS' : result === 'B' ? 'CRIMSON WINS' : 'DRAW'}
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
