import { useEffect, useRef, useState } from 'react';
import { TideGame, type GameStats } from '../game/loop';
import { TuningPanel } from '../dev/TuningPanel';
import { Hud } from './Hud';
import type { HostConnection } from '../net/host';
import type { MusicPlayer } from '../audio/player';
import type { SfxEngine } from '../audio/sfx';
import { config } from '../game/config';

export function ArenaScreen({
  host,
  music,
  sfx,
}: {
  host?: HostConnection;
  music?: MusicPlayer;
  sfx?: SfxEngine;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<TideGame | null>(null);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let game: TideGame | null = null;
    let bridgeRaf = 0;
    let audioRaf = 0;
    try {
      game = new TideGame(canvas);
      gameRef.current = game;
      (window as unknown as { tide?: TideGame }).tide = game;

      if (music) {
        game.setMusic(music);
        // track over mid-game: stay silent (or end the match, if configured)
        music.onEnded = () => {
          if (config.match.endOnTrackEnd) game?.finishByTrack();
        };
        // next game: restart a finished track; a still-playing one carries on
        game.onMatchStart = () => {
          if (!music.playing) music.play();
        };
      }

      // ---- SFX wiring ----
      if (sfx) {
        const g = game;
        g.onPush = (_slot, x, power) => sfx.push(x, power);
        g.onBallHit = (x, strength, kind) => {
          const s = Math.min(strength * 1.2, 1.8);
          if (kind === 'wall') sfx.ballHit(x, s);
          else sfx.splash(x, s);
        };
        const prevGoal = g.onGoal;
        g.onGoal = (team) => {
          prevGoal?.(team);
          sfx.goal(team);
          music?.underwater(true);
          setTimeout(() => music?.underwater(false), config.match.goalFreezeSec * 1000);
        };
        // continuous voices (wall hum / pinch / build riser)
        const audioTick = () => {
          const a = g.audioState();
          for (const slot of [0, 1] as const) {
            const pl = a.players[slot];
            const wk = `wall${slot}`;
            if (pl.active && pl.wall) {
              const note = slot === 0 ? config.abilities.wallNote0 : config.abilities.wallNote1;
              sfx.startWall(wk, pl.x, note);
              sfx.updateVoice(wk, { x: pl.x, peak: a.peak ? 1 : a.glow });
            } else sfx.stop(wk);
            const pk = `pinch${slot}`;
            if (pl.active && pl.pinch) {
              sfx.startPinch(pk, pl.x);
              sfx.updateVoice(pk, { x: pl.x });
            } else sfx.stop(pk);
          }
          sfx.setRiser(a.peak ? 0 : a.glow);
          audioRaf = requestAnimationFrame(audioTick);
        };
        audioRaf = requestAnimationFrame(audioTick);
      }

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
        const prevGoalH = g.onGoal;
        g.onGoal = (team) => {
          prevGoalH?.(team);
          for (const slot of [0, 1] as const)
            if (host.slots[slot].connected) host.sendHaptic(slot, [40, 40, 140]);
        };
        const prevPushH = g.onPush;
        g.onPush = (slot, x, power) => {
          prevPushH?.(slot, x, power);
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
                host.sendFeedback(slot, { ...g.playerFeedback(slot), peak: g.currentGlow() });
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
      cancelAnimationFrame(audioRaf);
      sfx?.stopAll();
      game?.dispose();
      gameRef.current = null;
    };
  }, [host, music, sfx]);

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
