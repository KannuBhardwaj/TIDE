import { useEffect, useRef, useState } from 'react';
import { MusicPlayer } from '../audio/player';
import { intensityAt } from '../audio/track';

const TRACKS = ['surge', 'aurora'];
const W = 1100;
const H = 300;

export function TrackInspector() {
  const [id, setId] = useState('surge');
  const [playing, setPlaying] = useState(false);
  const [info, setInfo] = useState({ t: 0, dur: 0, intensity: 0, peak: false });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<MusicPlayer | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const waveRef = useRef<{ min: number; max: number }[]>([]);

  // (re)load the selected track
  useEffect(() => {
    let alive = true;
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    const ctx = ctxRef.current;
    const player = new MusicPlayer(ctx);
    playerRef.current?.stop();
    playerRef.current = player;
    setPlaying(false);
    player.load(id).then(() => {
      if (!alive) return;
      const buf = player.audioBuffer;
      if (buf) {
        const data = buf.getChannelData(0);
        const cols: { min: number; max: number }[] = [];
        const step = Math.floor(data.length / W);
        for (let x = 0; x < W; x++) {
          let mn = 1;
          let mx = -1;
          for (let i = 0; i < step; i++) {
            const v = data[x * step + i] || 0;
            if (v < mn) mn = v;
            if (v > mx) mx = v;
          }
          cols.push({ min: mn, max: mx });
        }
        waveRef.current = cols;
      }
    });
    return () => {
      alive = false;
      player.stop();
    };
  }, [id]);

  // draw loop
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const cv = canvasRef.current;
      const player = playerRef.current;
      if (cv && player && player.track) {
        const g = cv.getContext('2d')!;
        const track = player.track;
        const dur = track.meta.duration;
        g.clearRect(0, 0, W, H);
        g.fillStyle = '#04141A';
        g.fillRect(0, 0, W, H);

        // peak windows
        for (const p of track.peaks) {
          const x0 = (p.buildStart / dur) * W;
          const x1 = (p.release / dur) * W;
          g.fillStyle = 'rgba(255,201,163,0.08)';
          g.fillRect(x0, 0, x1 - x0, H);
          const px0 = (p.peakStart / dur) * W;
          const px1 = (p.peakEnd / dur) * W;
          g.fillStyle = 'rgba(255,201,163,0.18)';
          g.fillRect(px0, 0, px1 - px0, H);
        }

        // waveform
        g.strokeStyle = 'rgba(234,246,242,0.25)';
        g.beginPath();
        for (let x = 0; x < waveRef.current.length; x++) {
          const c = waveRef.current[x];
          g.moveTo(x, H / 2 + (c.min * H) / 2);
          g.lineTo(x, H / 2 + (c.max * H) / 2);
        }
        g.stroke();

        // intensity curve
        g.strokeStyle = '#4FE3C1';
        g.lineWidth = 2;
        g.beginPath();
        for (let x = 0; x < W; x++) {
          const v = intensityAt(track, (x / W) * dur);
          const y = H - v * (H - 6) - 3;
          if (x === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
        g.lineWidth = 1;

        // beats
        g.strokeStyle = 'rgba(234,246,242,0.1)';
        g.beginPath();
        for (const b of track.beats) {
          const x = (b / dur) * W;
          g.moveTo(x, H - 10);
          g.lineTo(x, H);
        }
        g.stroke();

        // playhead
        const t = player.time();
        const px = (t / dur) * W;
        g.strokeStyle = '#EAF6F2';
        g.beginPath();
        g.moveTo(px, 0);
        g.lineTo(px, H);
        g.stroke();

        setInfo({ t, dur, intensity: intensityAt(track, t), peak: player.peakActive() });
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  function toggle() {
    const player = playerRef.current;
    const ctx = ctxRef.current;
    if (!player || !ctx) return;
    ctx.resume();
    if (playing) {
      player.stop();
      setPlaying(false);
    } else {
      player.play();
      setPlaying(true);
    }
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-abyss p-8">
      <div className="flex w-full max-w-[1100px] items-center justify-between">
        <div className="font-display text-2xl font-light tracking-[0.06em] text-pearl">
          track inspector
        </div>
        <div className="flex items-center gap-2">
          {TRACKS.map((t) => (
            <button
              key={t}
              onClick={() => setId(t)}
              className={`rounded-md border px-3 py-1 font-mono text-xs uppercase tracking-[0.15em] ${
                id === t ? 'border-teal text-teal' : 'border-white/15 text-pearl/50'
              }`}
            >
              {t}
            </button>
          ))}
          <button
            onClick={toggle}
            className="ml-3 rounded-md border border-teal/50 px-4 py-1 font-mono text-xs uppercase tracking-[0.15em] text-teal hover:bg-teal/10"
          >
            {playing ? 'stop' : 'play'}
          </button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="rounded-lg border border-white/10"
        style={{ width: W, height: H }}
      />

      <div className="flex w-full max-w-[1100px] justify-between font-mono text-[11px] text-pearl/50">
        <span>
          {info.t.toFixed(2)}s / {info.dur.toFixed(0)}s
        </span>
        <span>
          intensity <span className="text-teal">{info.intensity.toFixed(2)}</span>
        </span>
        <span>
          <span style={{ color: '#4FE3C1' }}>▬</span> intensity &nbsp;
          <span style={{ color: '#FFC9A3' }}>▮</span> peak window &nbsp; waveform
        </span>
        <span className={info.peak ? 'text-roseGold' : 'text-pearl/30'} style={{ color: info.peak ? '#FFC9A3' : undefined }}>
          {info.peak ? 'PEAK' : '—'}
        </span>
      </div>
    </div>
  );
}
