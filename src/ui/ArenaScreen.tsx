import { useEffect, useRef, useState } from 'react';
import { TideGame, type GameStats } from '../game/loop';
import { TuningPanel } from '../dev/TuningPanel';
import { Hud } from './Hud';
import type { HostConnection } from '../net/host';

export function ArenaScreen({ host }: { host?: HostConnection }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<TideGame | null>(null);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let game: TideGame | null = null;
    let bridgeRaf = 0;
    try {
      game = new TideGame(canvas);
      gameRef.current = game;
      (window as unknown as { tide?: TideGame }).tide = game;

      let last = 0;
      game.onStats = (s) => {
        const now = performance.now();
        if (now - last > 200) {
          last = now;
          setStats(s);
        }
      };

      if (host) {
        const g = game;
        g.onGoal = () => {
          for (const slot of [0, 1] as const)
            if (host.slots[slot].connected) host.sendHaptic(slot, [40, 40, 140]);
        };
        g.onPush = (slot) => {
          if (host.slots[slot].connected && host.slots[slot].haptics) host.sendHaptic(slot, [25]);
        };
        let fbLast = 0;
        const bridge = () => {
          const now = performance.now();
          for (const slot of [0, 1] as const) {
            const connected = host.slots[slot].connected;
            g.setInputMode(slot, connected ? 'external' : 'keyboard');
            if (connected) {
              g.setExternalInput(slot, host.getInput(slot));
              if (now - fbLast > 100) {
                host.sendFeedback(slot, { ...g.playerFeedback(slot), peak: 0 });
              }
            }
          }
          if (now - fbLast > 100) fbLast = now;
          bridgeRaf = requestAnimationFrame(bridge);
        };
        bridgeRaf = requestAnimationFrame(bridge);
      }

      game.start();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    return () => {
      cancelAnimationFrame(bridgeRaf);
      game?.dispose();
      gameRef.current = null;
    };
  }, [host]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-abyss">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute left-5 top-4 select-none">
        <div className="font-display text-[26px] font-light leading-none tracking-[0.02em] text-pearl">
          TIDE
        </div>
        <div className="label mt-1 text-pearl/45">move the water · not the ball</div>
      </div>

      {error ? (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <div className="max-w-lg rounded-xl border border-crimson/40 bg-abyss/80 p-6">
            <div className="label mb-2 text-crimson">WebGL error</div>
            <pre className="whitespace-pre-wrap font-mono text-xs text-pearl/80">{error}</pre>
          </div>
        </div>
      ) : (
        <>
          <Hud stats={stats} />
          <TuningPanel stats={stats} />
        </>
      )}
    </div>
  );
}
