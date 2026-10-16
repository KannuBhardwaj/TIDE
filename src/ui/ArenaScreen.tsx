import { useEffect, useRef, useState } from 'react';
import { TideGame, type GameStats } from '../game/loop';
import { TuningPanel } from '../dev/TuningPanel';
import { Hud } from './Hud';

export function ArenaScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<TideGame | null>(null);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let game: TideGame | null = null;
    try {
      game = new TideGame(canvas);
      gameRef.current = game;
      // dev handle for manual testing + the capture tool
      (window as unknown as { tide?: TideGame }).tide = game;
      // throttle React updates: the game calls onStats every frame, we store a
      // ref and flush to state a few times a second.
      let last = 0;
      game.onStats = (s) => {
        const now = performance.now();
        if (now - last > 200) {
          last = now;
          setStats(s);
        }
      };
      game.start();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    return () => {
      game?.dispose();
      gameRef.current = null;
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-abyss">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* title lockup */}
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
