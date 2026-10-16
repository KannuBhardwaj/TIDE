/**
 * Track data contract + sampling helpers. A track is an audio file plus a JSON
 * descriptor in public/tracks/<id>.json. The analysis tool (tools/analyze) or
 * the procedural generator (tools/gen-track) produce the JSON; a hand-authored
 * <id>.cues.json next to it overrides the detected peaks.
 */

export interface PeakWindow {
  buildStart: number; // seconds — intensity starts ramping
  peakStart: number; // seconds — the drop / apex (tightest timing target)
  peakEnd: number; // seconds — apex sustains until here
  release: number; // seconds — collapse / shockwave
}

export interface TrackMeta {
  title: string;
  key?: string; // e.g. "A minor" (SFX harmonize to this in M5)
  accent?: string; // per-track accent hex (palette hint)
  duration: number; // seconds
}

export interface TrackData {
  id: string;
  audio: string; // relative url, e.g. /tracks/surge.wav
  bpm: number;
  offset: number; // seconds before the first beat
  beats: number[]; // beat times (seconds)
  intensityRate: number; // samples per second (20)
  intensity: number[]; // 0..1 energy envelope at intensityRate
  peaks: PeakWindow[];
  meta: TrackMeta;
}

export interface CueOverride {
  peaks: PeakWindow[];
}

/** load a track descriptor, applying an optional <id>.cues.json peak override. */
export async function loadTrack(id: string, base = '/tracks'): Promise<TrackData> {
  const res = await fetch(`${base}/${id}.json`);
  if (!res.ok) throw new Error(`track ${id}: ${res.status}`);
  const data = (await res.json()) as TrackData;
  try {
    const cueRes = await fetch(`${base}/${id}.cues.json`);
    if (cueRes.ok) {
      const cues = (await cueRes.json()) as CueOverride;
      if (Array.isArray(cues.peaks)) data.peaks = cues.peaks;
    }
  } catch {
    /* no cues override — fine */
  }
  return data;
}

/** sample the intensity envelope at time t (seconds), linearly interpolated. */
export function intensityAt(track: TrackData, t: number): number {
  const arr = track.intensity;
  if (arr.length === 0) return 0;
  const f = t * track.intensityRate;
  if (f <= 0) return arr[0];
  if (f >= arr.length - 1) return arr[arr.length - 1];
  const i = Math.floor(f);
  const frac = f - i;
  return arr[i] * (1 - frac) + arr[i + 1] * frac;
}

/** phase within the current beat, 0 at a beat, approaching 1 just before the next. */
export function beatPhase(track: TrackData, t: number): number {
  const spb = 60 / track.bpm;
  const rel = t - track.offset;
  if (rel < 0) return 0;
  return (rel % spb) / spb;
}

/** the peak window active (or imminent within lookahead) at time t, else null. */
export function activePeak(
  track: TrackData,
  t: number,
  lookahead: number,
): PeakWindow | null {
  for (const p of track.peaks) {
    if (t >= p.buildStart - lookahead && t <= p.release) return p;
  }
  return null;
}
