import { describe, it, expect } from 'vitest';
import { Match, detectGoal, type GoalGeom } from './match';

const geom: GoalGeom = { inset: 0.035, half: 0.16 };

const R = 0.045;

describe('detectGoal', () => {
  it('scores for A when the leading edge crosses the right line within the mouth', () => {
    expect(detectGoal(0.95, 0.5, R, geom)).toBe('A'); // center clamped short, edge crosses
  });
  it('scores for B when the leading edge crosses the left line within the mouth', () => {
    expect(detectGoal(0.05, 0.52, R, geom)).toBe('B');
  });
  it('no goal when outside the mouth height', () => {
    expect(detectGoal(0.95, 0.9, R, geom)).toBeNull();
    expect(detectGoal(0.05, 0.1, R, geom)).toBeNull();
  });
  it('no goal in open play', () => {
    expect(detectGoal(0.5, 0.5, R, geom)).toBeNull();
  });
});

describe('Match', () => {
  it('tracks score and does not end before the target', () => {
    const m = new Match(5);
    for (let i = 0; i < 4; i++) {
      expect(m.registerGoal('A')).toBe(false);
    }
    expect(m.scoreA).toBe(4);
    expect(m.state).toBe('goal');
    expect(m.winner).toBeNull();
  });

  it('ends and declares a winner at the target', () => {
    const m = new Match(5);
    for (let i = 0; i < 5; i++) m.registerGoal('A');
    expect(m.winner).toBe('A');
    expect(m.state).toBe('ended');
  });

  it('ignores further goals once ended', () => {
    const m = new Match(1);
    expect(m.registerGoal('B')).toBe(true);
    expect(m.registerGoal('A')).toBe(true);
    expect(m.scoreA).toBe(0);
    expect(m.winner).toBe('B');
  });

  it('resume returns to play after a goal', () => {
    const m = new Match(5);
    m.registerGoal('A');
    expect(m.state).toBe('goal');
    m.resume();
    expect(m.state).toBe('playing');
  });
});
