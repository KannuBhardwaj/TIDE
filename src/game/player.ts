/**
 * Player marker + abilities. A player never touches the ball — they move water.
 * Movement injects a wake; PUSH bursts water outward (tap, costs energy +
 * cooldown); PINCH pulls water inward (hold, drains energy); WALL raises a solid
 * obstacle (hold, drains energy faster). Energy regenerates only when idle.
 */
import { config } from './config';
import type { FluidSolver } from '../sim/fluid';

export type Team = 'A' | 'B';

export interface PlayerInput {
  joystick: { x: number; y: number }; // -1..1
  push: boolean;
  pinch: boolean;
  wall: boolean;
}

export const NEUTRAL_INPUT: PlayerInput = {
  joystick: { x: 0, y: 0 },
  push: false,
  pinch: false,
  wall: false,
};

/** team-colored dye (teal-biased to stay in the aurora palette). */
const TEAM_DYE: Record<Team, [number, number, number]> = {
  A: [0.4, 0.42, 0.22], // warm gold-ish
  B: [0.44, 0.22, 0.26], // crimson-ish
};

export class Player {
  readonly id: number;
  readonly team: Team;
  pos: { x: number; y: number };
  vel = { x: 0, y: 0 };
  energy = 1;
  active = true;
  wallActive = false;
  pushedThisFrame = false;

  private pushCd = 0;
  private wasPush = false;

  constructor(id: number, team: Team, x: number, y: number) {
    this.id = id;
    this.team = team;
    this.pos = { x, y };
  }

  reset(x: number, y: number) {
    this.pos = { x, y };
    this.vel = { x: 0, y: 0 };
    this.energy = 1;
    this.wallActive = false;
    this.pushCd = 0;
    this.wasPush = false;
  }

  update(dt: number, input: PlayerInput, fluid: FluidSolver) {
    this.pushedThisFrame = false;
    if (!this.active) {
      this.wallActive = false;
      return;
    }
    const pc = config.players;
    const ab = config.abilities;
    const r = pc.radius;

    // --- movement ---
    const jx = clamp(input.joystick.x, -1, 1);
    const jy = clamp(input.joystick.y, -1, 1);
    const nx = clamp(this.pos.x + jx * pc.moveSpeed * dt, r, 1 - r);
    const ny = clamp(this.pos.y + jy * pc.moveSpeed * dt, r, 1 - r);
    this.vel.x = (nx - this.pos.x) / dt;
    this.vel.y = (ny - this.pos.y) / dt;
    this.pos.x = nx;
    this.pos.y = ny;

    // marker wake into the water
    const moving = Math.hypot(this.vel.x, this.vel.y);
    if (moving > 1e-3) {
      fluid.splatVelocity(this.pos.x, this.pos.y, this.vel.x * pc.wakeForce, this.vel.y * pc.wakeForce, r * 100);
      this.splatTeamDye(fluid, 0.08, r * 70);
    }

    // --- abilities ---
    let draining = false;

    // PUSH (rising edge, cooldown + cost)
    this.pushCd = Math.max(0, this.pushCd - dt);
    if (input.push && !this.wasPush && this.pushCd <= 0 && this.energy >= ab.pushCost) {
      fluid.splatRadial(this.pos.x, this.pos.y, ab.pushRadius, ab.pushForce);
      this.splatTeamDye(fluid, 0.14, ab.pushRadius * 100);
      this.energy -= ab.pushCost;
      this.pushCd = ab.pushCooldown;
      this.pushedThisFrame = true;
    }
    this.wasPush = input.push;

    // PINCH (hold, drains)
    if (input.pinch && this.energy > 0) {
      fluid.splatRadial(this.pos.x, this.pos.y, ab.pinchRadius, -ab.pinchForce);
      this.energy -= ab.pinchDrain * dt;
      draining = true;
    }

    // WALL (hold, drains faster; needs a minimum to (re)raise)
    if (input.wall && (this.wallActive ? this.energy > 0 : this.energy >= ab.wallMinEnergy)) {
      this.wallActive = true;
      this.energy -= ab.wallDrain * dt;
      draining = true;
    } else {
      this.wallActive = false;
    }

    // regen only when idle
    if (!draining) this.energy += pc.energyRegen * dt;
    this.energy = clamp(this.energy, 0, 1);
  }

  private splatTeamDye(fluid: FluidSolver, strength: number, radius: number) {
    const [r, g, b] = TEAM_DYE[this.team];
    fluid.splatDye(this.pos.x, this.pos.y, r * strength * 2, g * strength * 2, b * strength * 2, radius);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
