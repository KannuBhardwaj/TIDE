/**
 * No-Python track analyzer. Reads a 16-bit PCM mono WAV (convert first with
 * ffmpeg) and writes the TIDE <id>.json: RMS intensity @20Hz, autocorrelation
 * BPM + beat grid, and peaks (auto, or from <id>.cues.json which overrides).
 *
 *   ffmpeg -i rising_tide.mp3 -ac 1 -ar 22050 -c:a pcm_s16le rising_tide.wav
 *   node tools/analyze/analyze_node.mjs rising_tide.wav --id rising_tide \
 *        --title "Rising Tide" --key "A minor" --accent "#FFC9A3"
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';

const args = process.argv.slice(2);
const wavPath = args[0];
const argv = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
if (!wavPath) {
  console.error('usage: node analyze_node.mjs <file.wav> [--id --title --key --accent --audio]');
  process.exit(1);
}

const id = argv('--id', basename(wavPath).replace(/\.wav$/i, ''));
const title = argv('--title', id);
const key = argv('--key', 'A minor');
const accent = argv('--accent', '#4FE3C1');
const audioUrl = argv('--audio', `/tracks/${id}.mp3`);
const INTENSITY_RATE = 20;

// --- read WAV (PCM16 mono) ---
const buf = readFileSync(wavPath);
function findChunk(tag) {
  let off = 12;
  while (off + 8 <= buf.length) {
    const id4 = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id4 === tag) return { off: off + 8, size };
    off += 8 + size + (size & 1);
  }
  return null;
}
const fmt = findChunk('fmt ');
const sr = buf.readUInt32LE(fmt.off + 4);
const channels = buf.readUInt16LE(fmt.off + 2);
const bits = buf.readUInt16LE(fmt.off + 14);
const dataChunk = findChunk('data');
if (bits !== 16) throw new Error(`expected 16-bit PCM, got ${bits}`);
const n = Math.floor(dataChunk.size / 2 / channels);
const x = new Float32Array(n);
for (let i = 0; i < n; i++) {
  // take channel 0 if stereo
  x[i] = buf.readInt16LE(dataChunk.off + i * 2 * channels) / 32768;
}
const duration = n / sr;

// --- RMS envelope ---
const hop = 512;
const win = 2048;
const frames = Math.floor((n - win) / hop);
const rms = new Float32Array(Math.max(frames, 1));
for (let f = 0; f < frames; f++) {
  let s = 0;
  const start = f * hop;
  for (let i = 0; i < win; i++) {
    const v = x[start + i];
    s += v * v;
  }
  rms[f] = Math.sqrt(s / win);
}

// resample to 20 Hz + smooth + normalize
const nOut = Math.floor(duration * INTENSITY_RATE) + 1;
const intensity = new Float32Array(nOut);
for (let k = 0; k < nOut; k++) {
  const t = k / INTENSITY_RATE;
  const ff = (t * sr) / hop;
  const i0 = Math.min(Math.floor(ff), frames - 1);
  const i1 = Math.min(i0 + 1, frames - 1);
  const frac = ff - i0;
  intensity[k] = rms[i0] * (1 - frac) + rms[i1] * frac;
}
// moving-average smooth
const sm = new Float32Array(nOut);
const W = 5;
for (let k = 0; k < nOut; k++) {
  let s = 0;
  let c = 0;
  for (let j = -W; j <= W; j++) {
    const idx = k + j;
    if (idx >= 0 && idx < nOut) {
      s += intensity[idx];
      c++;
    }
  }
  sm[k] = s / c;
}
let mx = 0;
for (const v of sm) mx = Math.max(mx, v);
for (let k = 0; k < nOut; k++) sm[k] = mx > 0 ? Math.min(sm[k] / mx, 1) : 0;

// --- BPM via onset-flux autocorrelation ---
const flux = new Float32Array(frames);
for (let f = 1; f < frames; f++) flux[f] = Math.max(0, rms[f] - rms[f - 1]);
const framesPerSec = sr / hop;
const minLag = Math.floor(framesPerSec * (60 / 180)); // 180 bpm
const maxLag = Math.floor(framesPerSec * (60 / 70)); // 70 bpm
let bestLag = minLag;
let bestVal = -1;
for (let lag = minLag; lag <= maxLag; lag++) {
  let s = 0;
  for (let f = lag; f < frames; f++) s += flux[f] * flux[f - lag];
  if (s > bestVal) {
    bestVal = s;
    bestLag = lag;
  }
}
let bpm = Math.round(60 / (bestLag / framesPerSec));
while (bpm < 90) bpm *= 2; // fold to a musical range
while (bpm > 180) bpm = Math.round(bpm / 2);

// offset = first strong onset
let offset = 0;
let fmax = 0;
for (let f = 0; f < Math.min(frames, framesPerSec * 8); f++) fmax = Math.max(fmax, flux[f]);
for (let f = 0; f < frames; f++) {
  if (flux[f] > fmax * 0.5) {
    offset = +(f / framesPerSec).toFixed(3);
    break;
  }
}

const beats = [];
for (let t = offset; t < duration; t += 60 / bpm) beats.push(+t.toFixed(3));

// --- peaks: auto, then cues override ---
function detectPeaks() {
  const peaks = [];
  const hi = 0.72;
  const build = 0.42;
  const rel = 0.5;
  let i = 0;
  while (i < nOut) {
    if (sm[i] >= hi) {
      const start = i;
      while (i < nOut && sm[i] >= hi) i++;
      const end = i - 1;
      if ((end - start) / INTENSITY_RATE < 0.4) continue;
      let b = start;
      while (b > 0 && sm[b] > build) b--;
      let r = end;
      while (r < nOut - 1 && sm[r] > rel) r++;
      peaks.push({
        buildStart: +(b / INTENSITY_RATE).toFixed(3),
        peakStart: +(start / INTENSITY_RATE).toFixed(3),
        peakEnd: +(end / INTENSITY_RATE).toFixed(3),
        release: +(r / INTENSITY_RATE).toFixed(3),
      });
    } else i++;
  }
  return peaks;
}
let peaks = detectPeaks();
const outDir = dirname(wavPath);
const cuesPath = join(outDir, `${id}.cues.json`);
if (existsSync(cuesPath)) {
  const cues = JSON.parse(readFileSync(cuesPath, 'utf8'));
  if (Array.isArray(cues.peaks)) {
    peaks = cues.peaks;
    console.log(`using manual cues from ${cuesPath}`);
  }
}

const data = {
  id,
  audio: audioUrl,
  bpm,
  offset,
  beats,
  intensityRate: INTENSITY_RATE,
  intensity: Array.from(sm, (v) => +v.toFixed(3)),
  peaks,
  meta: { title, key, accent, duration: +duration.toFixed(2) },
};
const outPath = join(outDir, `${id}.json`);
writeFileSync(outPath, JSON.stringify(data));
console.log(`wrote ${outPath}`);
console.log(`  ${duration.toFixed(1)}s · ${bpm} bpm · ${beats.length} beats · ${peaks.length} peaks`);
