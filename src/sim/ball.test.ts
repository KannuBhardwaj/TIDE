import { describe, it, expect, beforeEach } from 'vitest';
import { Ball, FIELD_TO_WORLD, type Vec2 } from './ball';
import { config } from '../game/config';

/** a sampler that reports a constant water velocity everywhere. */
const constant = (vx: number, vy: number) => (_u: number, _v: number, out: Vec2) => {
  out.x = vx;
  out.y = vy;
};
const still = constant(0, 0);

describe('Ball physics', () => {
  beforeEach(() => {
    config.ball.stalemateSeconds = 4;
    config.ball.maxSpeed = 1.6;
    config.ball.damping = 0.9;
  });

  it('is dragged in the direction of the water flow', () => {
    const ball = new Ball(0.5, 0.5);
    const water = constant(20, 0); // gentle rightward current (stays off the wall)
    for (let i = 0; i < 20; i++) ball.update(1 / 60, water);
    expect(ball.vel.x).toBeGreaterThan(0);
    expect(ball.pos.x).toBeGreaterThan(0.5);
    expect(ball.pos.x).toBeLessThan(1 - ball.radius); // hasn't reached the wall yet
    // drag pulls toward, but damping keeps it under, the water's world velocity
    expect(ball.vel.x).toBeLessThanOrEqual(20 * FIELD_TO_WORLD + 1e-6);
  });

  it('never exceeds max speed', () => {
    const ball = new Ball(0.5, 0.5);
    const water = constant(100000, 100000);
    for (let i = 0; i < 120; i++) ball.update(1 / 60, water);
    expect(ball.speed).toBeLessThanOrEqual(config.ball.maxSpeed + 1e-4);
  });

  it('stays inside the arena and bounces off walls', () => {
    const ball = new Ball(0.5, 0.5);
    const water = constant(5000, 0);
    for (let i = 0; i < 300; i++) {
      ball.update(1 / 60, water);
      expect(ball.pos.x).toBeGreaterThanOrEqual(ball.radius - 1e-6);
      expect(ball.pos.x).toBeLessThanOrEqual(1 - ball.radius + 1e-6);
    }
  });

  it('rests and never drifts in calm water', () => {
    const ball = new Ball(0.5, 0.5);
    for (let i = 0; i < 60 * 3; i++) ball.update(1 / 60, still);
    expect(ball.speed).toBe(0);
    expect(ball.pos).toEqual({ x: 0.5, y: 0.5 });
    expect(ball.tidePulse).toBe(false);
  });

  it('ignores tiny residual currents below the deadzone', () => {
    const ball = new Ball(0.5, 0.5);
    // water below the deadzone (0.03 world => 3 raw units) must not move it
    const trickle = constant(2, 0);
    for (let i = 0; i < 60 * 2; i++) ball.update(1 / 60, trickle);
    expect(ball.pos.x).toBe(0.5);
  });

  it('fires a tide pulse when stuck despite active water', () => {
    const ball = new Ball(0.5, 0.5);
    // active water (>= deadzone) but weak enough that the ball creeps below the
    // stall speed — i.e. effectively pinned — should eventually tide-pulse.
    const weakActive = constant(3.3, 0);
    let pulses = 0;
    for (let i = 0; i < 60 * 5; i++) {
      ball.update(1 / 60, weakActive);
      if (ball.tidePulse) pulses++;
    }
    expect(pulses).toBeGreaterThanOrEqual(1);
  });

  it('resets cleanly', () => {
    const ball = new Ball(0.2, 0.2);
    ball.update(1 / 60, constant(100, 100));
    ball.reset(0.5, 0.5);
    expect(ball.pos).toEqual({ x: 0.5, y: 0.5 });
    expect(ball.vel).toEqual({ x: 0, y: 0 });
    expect(ball.stalledTime).toBe(0);
  });
});
