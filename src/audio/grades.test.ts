import { describe, it, expect } from 'vitest';
import { gradeAt, powerFromIntensity, abilityMultiplier, glowIntensity } from './grades';
import type { TrackData } from './track';
import { config } from '../game/config';

const track: TrackData = {
  id: 't',
  audio: '',
  bpm: 120,
  offset: 0,
  beats: [],
  intensityRate: 20,
  intensity: new Array(200).fill(0).map((_, i) => (i < 100 ? 0.2 : 1.0)),
  peaks: [{ buildStart: 2, peakStart: 5, peakEnd: 7, release: 8 }],
  meta: { title: 't', duration: 10 },
};

describe('powerFromIntensity', () => {
  it('scales from 1 at rest to 1+gain at full intensity', () => {
    expect(powerFromIntensity(0)).toBeCloseTo(1);
    expect(powerFromIntensity(1)).toBeCloseTo(1 + config.crescendo.intensityGain);
  });
});

describe('gradeAt', () => {
  it('gives the best bonus exactly on peakStart', () => {
    const g = gradeAt(track, 5);
    expect(g.label).toBe('perfect');
    expect(g.bonus).toBeCloseTo(1 + config.crescendo.peakBonusMax);
  });
  it('gives partial credit near the apex', () => {
    const near = gradeAt(track, 5 + config.crescendo.gradeWindow * 0.5);
    expect(near.bonus).toBeGreaterThan(1);
    expect(near.bonus).toBeLessThan(1 + config.crescendo.peakBonusMax);
  });
  it('gives no bonus outside any peak region', () => {
    expect(gradeAt(track, 0).label).toBe('none');
    expect(gradeAt(track, 9).bonus).toBe(1);
  });
});

describe('abilityMultiplier', () => {
  it('combines intensity power and timing bonus', () => {
    const { mult } = abilityMultiplier(track, 5); // full intensity + perfect
    expect(mult).toBeCloseTo((1 + config.crescendo.intensityGain) * (1 + config.crescendo.peakBonusMax));
  });
  it('is 1 with no track', () => {
    expect(abilityMultiplier(null, 5).mult).toBe(1);
  });
});

describe('glowIntensity', () => {
  it('ramps up before the peak (lookahead) and is max at the apex', () => {
    const before = glowIntensity(track, 2 - config.crescendo.lookahead + 0.01);
    const apex = glowIntensity(track, 6);
    expect(apex).toBeCloseTo(1);
    expect(before).toBeLessThan(apex);
  });
});
