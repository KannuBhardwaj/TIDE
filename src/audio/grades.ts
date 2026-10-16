/**
 * Pure crescendo math: the base power factor from intensity and the timing
 * grade for peak-timed ability activations. Authoritative on the laptop. The
 * caller passes an already latency-compensated time.
 */
import { config } from '../game/config';
import { intensityAt, type PeakWindow, type TrackData } from './track';

export type GradeLabel = 'perfect' | 'great' | 'good' | 'none';
export interface Grade {
  label: GradeLabel;
  bonus: number; // multiplier >= 1
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** base ability power from the current intensity (always applies). */
export function powerFromIntensity(intensity: number): number {
  return 1 + config.crescendo.intensityGain * clamp01(intensity);
}

/** timing grade for an activation at time t — tightest at the nearest peakStart. */
export function gradeAt(track: TrackData, t: number): Grade {
  const win = config.crescendo.gradeWindow;
  let best: PeakWindow | null = null;
  let bestDist = Infinity;
  for (const p of track.peaks) {
    if (t >= p.buildStart && t <= p.peakEnd) {
      const d = Math.abs(t - p.peakStart);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
  }
  if (!best) return { label: 'none', bonus: 1 };
  if (bestDist > win) {
    // inside the peak region but away from the apex: small credit
    return { label: 'good', bonus: 1 + config.crescendo.peakBonusMax * 0.25 };
  }
  const closeness = 1 - bestDist / win; // 1 at peakStart, 0 at window edge
  const bonus = 1 + config.crescendo.peakBonusMax * closeness;
  const label: GradeLabel = closeness > 0.75 ? 'perfect' : closeness > 0.4 ? 'great' : 'good';
  return { label, bonus };
}

/** total ability multiplier at time t (intensity power × timing bonus). */
export function abilityMultiplier(track: TrackData | null, t: number): { mult: number; grade: Grade } {
  if (!track) return { mult: 1, grade: { label: 'none', bonus: 1 } };
  const power = powerFromIntensity(intensityAt(track, t));
  const grade = gradeAt(track, t);
  return { mult: power * grade.bonus, grade };
}

/**
 * Visual crescendo intensity 0..1 for the edge glow. Uses the envelope, but
 * ramps up early (lookahead) as a peak approaches so the glow leads the audio.
 */
export function glowIntensity(track: TrackData, t: number): number {
  const base = intensityAt(track, t);
  let lead = 0;
  const la = config.crescendo.lookahead;
  for (const p of track.peaks) {
    if (t >= p.buildStart - la && t < p.peakStart) {
      const ramp = clamp01((t - (p.buildStart - la)) / (p.peakStart - (p.buildStart - la)));
      lead = Math.max(lead, ramp);
    } else if (t >= p.peakStart && t <= p.peakEnd) {
      lead = Math.max(lead, 1);
    } else if (t > p.peakEnd && t <= p.release) {
      lead = Math.max(lead, clamp01(1 - (t - p.peakEnd) / Math.max(p.release - p.peakEnd, 0.01)));
    }
  }
  return clamp01(Math.max(base, lead));
}
