/**
 * Procedural placeholder-track generator. Synthesizes obvious build/drop tracks
 * (16-bit PCM WAV) plus their TIDE JSON descriptors so the whole game is
 * testable before real tracks exist. Run with:  npm run gen-track
 *
 * Real tracks: drop <id>.mp3 + <id>.json (from tools/analyze) into public/tracks.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../public/tracks');
const SR = 44100;

interface Peak {
  buildStart: number;
  peakStart: number;
  peakEnd: number;
  release: number;
}
type CP = [number, number][];

function interp(cp: CP, t: number): number {
  if (t <= cp[0][0]) return cp[0][1];
  if (t >= cp[cp.length - 1][0]) return cp[cp.length - 1][1];
  for (let i = 0; i < cp.length - 1; i++) {
    const [t0, v0] = cp[i];
    const [t1, v1] = cp[i + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * f;
    }
  }
  return 0;
}

function synth(bpm: number, duration: number, cp: CP, peaks: Peak[], root: number): Float32Array {
  const N = Math.floor(duration * SR);
  const buf = new Float32Array(N);
  const spb = 60 / bpm;
  const inBuild = (t: number) => peaks.find((p) => t >= p.buildStart && t < p.peakStart);
  const inPeak = (t: number) => peaks.find((p) => t >= p.peakStart && t <= p.peakEnd);
  let seed = 1234;
  const noise = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed / 0x3fffffff - 1) * 1;
  };
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const env = interp(cp, t);
    // kick on each beat
    const tb = t - Math.floor(t / spb) * spb;
    const kickEnv = tb < 0.22 ? Math.exp(-tb * 20) : 0;
    const kick = Math.sin(2 * Math.PI * (55 + 30 * kickEnv) * tb) * kickEnv * (0.5 + 0.5 * env) * 0.8;
    // sub + chord pad (root, fifth, octave)
    const lfo = 0.85 + 0.15 * Math.sin(2 * Math.PI * 0.1 * t);
    const sub = Math.sin(2 * Math.PI * root * t) * env * 0.18;
    const chord =
      (Math.sin(2 * Math.PI * root * 2 * t) +
        Math.sin(2 * Math.PI * root * 3 * t) * 0.7 +
        Math.sin(2 * Math.PI * root * 4 * t) * 0.5) *
      env *
      0.07 *
      lfo;
    // riser during builds
    let riser = 0;
    const b = inBuild(t);
    if (b) {
      const r = (t - b.buildStart) / (b.peakStart - b.buildStart);
      riser = noise() * r * r * 0.25 + Math.sin(2 * Math.PI * (300 + 1200 * r) * t) * r * r * 0.08;
    }
    // shimmer at the apex
    let shimmer = 0;
    if (inPeak(t)) {
      shimmer = (Math.sin(2 * Math.PI * root * 6 * t) + Math.sin(2 * Math.PI * root * 8 * t)) * 0.05 * env;
    }
    let s = kick + sub + chord + riser + shimmer;
    s = Math.tanh(s * 1.4) * 0.85; // soft clip + headroom
    buf[i] = s;
  }
  return buf;
}

function writeWav(path: string, samples: Float32Array) {
  const N = samples.length;
  const buf = Buffer.alloc(44 + N * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + N * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(N * 2, 40);
  for (let i = 0; i < N; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE((v * 32767) | 0, 44 + i * 2);
  }
  writeFileSync(path, buf);
}

function generate(
  id: string,
  title: string,
  bpm: number,
  duration: number,
  cp: CP,
  peaks: Peak[],
  root: number,
  accent: string,
  key: string,
) {
  const samples = synth(bpm, duration, cp, peaks, root);
  writeWav(resolve(OUT, `${id}.wav`), samples);

  const rate = 20;
  const intensity: number[] = [];
  for (let i = 0; i <= duration * rate; i++) intensity.push(round(interp(cp, i / rate)));

  const beats: number[] = [];
  const spb = 60 / bpm;
  for (let t = 0; t < duration; t += spb) beats.push(round(t));

  const json = {
    id,
    audio: `/tracks/${id}.wav`,
    bpm,
    offset: 0,
    beats,
    intensityRate: rate,
    intensity,
    peaks,
    meta: { title, key, accent, duration },
  };
  writeFileSync(resolve(OUT, `${id}.json`), JSON.stringify(json));
  console.log(`  ✓ ${id}  (${duration}s, ${bpm}bpm, ${peaks.length} peak${peaks.length > 1 ? 's' : ''})`);
}

const round = (v: number) => Math.round(v * 1000) / 1000;

mkdirSync(OUT, { recursive: true });
console.log('generating placeholder tracks →', OUT);

generate(
  'surge',
  'Surge',
  128,
  96,
  [
    [0, 0.08], [8, 0.2], [16, 0.34], [32, 0.5], [40, 0.46], [48, 0.56], [55, 0.95],
    [56, 1.0], [68, 0.95], [70, 0.4], [76, 0.3], [84, 0.52], [89, 0.95], [90, 1.0],
    [95, 0.9], [96, 0.25],
  ],
  [
    { buildStart: 48, peakStart: 56, peakEnd: 68, release: 72 },
    { buildStart: 84, peakStart: 90, peakEnd: 95, release: 96 },
  ],
  110,
  '#4FE3C1',
  'A minor',
);

generate(
  'aurora',
  'Aurora',
  100,
  88,
  [
    [0, 0.05], [10, 0.18], [24, 0.3], [36, 0.42], [44, 0.5], [52, 0.62], [59, 0.9],
    [60, 1.0], [72, 0.92], [74, 0.35], [80, 0.52], [86, 0.85], [88, 0.5],
  ],
  [{ buildStart: 52, peakStart: 60, peakEnd: 72, release: 76 }],
  98,
  '#FF8FB0',
  'D minor',
);

console.log('done.');
