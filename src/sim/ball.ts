/**
 * Ball physics. Operates in arena UV space: [0..1] on both axes, y up.
 * It samples a coarse water-velocity field (injected as a function so this
 * module stays pure and unit-testable) and is dragged by the flow, giving the
 * heavy, momentum-y feel we want. The ball injects a wake back into the fluid
 * (handled by the caller reading `vel`), closing the two-way coupling loop.
 */
import { config } from '../game/config';

/** Maps raw sim-field velocity units into arena world velocity (uv/s). */
export const FIELD_TO_WORLD = 0.01;

export interface Vec2 {
  x: number;
  y: number;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export type WaterSampler = (u: number, v: number, out: Vec2) => void;

export class Ball {
  pos: Vec2;
  vel: Vec2 = { x: 0, y: 0 };
  radius: number;
  /** seconds the ball has been nearly motionless (for anti-stalemate). */
  stalledTime = 0;
  /** set true on the frame a stalemate tide pulse should fire. */
  tidePulse = false;

  private water: Vec2 = { x: 0, y: 0 };

  constructor(x = 0.5, y = 0.5) {
    this.pos = { x, y };
    this.radius = config.ball.radius;
  }

  reset(x = 0.5, y = 0.5) {
    this.pos = { x, y };
    this.vel = { x: 0, y: 0 };
    this.stalledTime = 0;
    this.tidePulse = false;
  }

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.y);
  }

  update(dt: number, sampleWater: WaterSampler, obstacles: readonly Circle[] = []) {
    const c = config.ball;
    this.radius = c.radius;
    sampleWater(this.pos.x, this.pos.y, this.water);

    // world-space water velocity under the ball
    let wvx = this.water.x * FIELD_TO_WORLD;
    let wvy = this.water.y * FIELD_TO_WORLD;
    const waterSpeed = Math.hypot(wvx, wvy);
    const waterActive = waterSpeed >= c.waterDeadzone;
    // ignore tiny residual currents so the ball only moves on real interaction
    if (!waterActive) {
      wvx = 0;
      wvy = 0;
    }

    // drag toward water velocity (heavier mass => slower response)
    const k = (c.drag * dt) / c.mass;
    this.vel.x += (wvx - this.vel.x) * k;
    this.vel.y += (wvy - this.vel.y) * k;

    // linear damping (settle / heaviness)
    const damp = Math.max(0, 1 - c.damping * dt);
    this.vel.x *= damp;
    this.vel.y *= damp;

    // static rest: when the water is calm and the ball is nearly stopped,
    // snap it to a dead stop so it never drifts on its own.
    if (!waterActive && this.speed < c.restThreshold) {
      this.vel.x = 0;
      this.vel.y = 0;
    }

    // clamp speed
    const sp = this.speed;
    if (sp > c.maxSpeed) {
      const s = c.maxSpeed / sp;
      this.vel.x *= s;
      this.vel.y *= s;
    }

    // integrate
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;

    this.collideBounds(c.restitution);
    for (const o of obstacles) this.collideCircle(o, c.restitution);

    // anti-stalemate: only when the ball is stuck *despite* active water
    // (i.e. trapped/pinned) — an idle ball in calm water is left at rest.
    this.tidePulse = false;
    if (waterActive && this.speed < 0.03) {
      this.stalledTime += dt;
      if (this.stalledTime >= c.stalemateSeconds) {
        this.tidePulse = true;
        this.stalledTime = 0;
      }
    } else {
      this.stalledTime = 0;
    }
  }

  /** push the ball out of a solid circle and reflect its velocity. */
  private collideCircle(o: Circle, restitution: number) {
    let dx = this.pos.x - o.x;
    let dy = this.pos.y - o.y;
    let dist = Math.hypot(dx, dy);
    const min = o.r + this.radius;
    if (dist >= min) return;
    if (dist < 1e-5) {
      // ball exactly on center: pick an arbitrary normal
      dx = 1;
      dy = 0;
      dist = 1;
    }
    const nx = dx / dist;
    const ny = dy / dist;
    // depenetrate
    this.pos.x = o.x + nx * min;
    this.pos.y = o.y + ny * min;
    // reflect the inward velocity component
    const vn = this.vel.x * nx + this.vel.y * ny;
    if (vn < 0) {
      this.vel.x -= (1 + restitution) * vn * nx;
      this.vel.y -= (1 + restitution) * vn * ny;
    }
  }

  private collideBounds(restitution: number) {
    const r = this.radius;
    if (this.pos.x < r) {
      this.pos.x = r;
      this.vel.x = Math.abs(this.vel.x) * restitution;
    } else if (this.pos.x > 1 - r) {
      this.pos.x = 1 - r;
      this.vel.x = -Math.abs(this.vel.x) * restitution;
    }
    if (this.pos.y < r) {
      this.pos.y = r;
      this.vel.y = Math.abs(this.vel.y) * restitution;
    } else if (this.pos.y > 1 - r) {
      this.pos.y = 1 - r;
      this.vel.y = -Math.abs(this.vel.y) * restitution;
    }
  }
}
