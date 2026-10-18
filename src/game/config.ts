/**
 * Single source of truth for every tunable number in TIDE.
 * The live tuning panel mutates `config` in place; modules must read
 * `config.<group>.<field>` each frame rather than caching values.
 *
 * Keep gameplay/physics here. Pure visual constants that never need tuning
 * can live beside their shader, but anything we might tweak during a demo
 * belongs here.
 */

export interface TideConfig {
  sim: {
    /** simulation grid resolution (velocity/pressure). dye runs higher. */
    simResolution: number;
    dyeResolution: number;
    /** velocity dissipation per second (1 = no loss). */
    velocityDissipation: number;
    /** dye dissipation per second. */
    dyeDissipation: number;
    /** pressure field retention between frames. */
    pressure: number;
    /** Jacobi iterations for the pressure solve. */
    pressureIterations: number;
    /** vorticity confinement strength (adds swirl / energy). */
    curl: number;
    /** fixed physics timestep (seconds). */
    dt: number;
  };
  ball: {
    radius: number; // world units (0..1 arena space, see arena)
    mass: number;
    /** coupling: how strongly water velocity drags the ball. */
    drag: number;
    /** linear damping per second (the "heaviness" / settle). */
    damping: number;
    /** restitution off walls/arena. */
    restitution: number;
    /** strength of the wake the ball injects back into the fluid.
     *  Must stay sub-unity-gain vs `drag` or the coupling runs away. */
    wakeForce: number;
    /** max speed clamp (world units / s). */
    maxSpeed: number;
    /** water (world) speed below which the flow is ignored — the ball only
     *  responds to meaningful currents, so it rests when the water is calm. */
    waterDeadzone: number;
    /** ball speed below which it snaps to rest when the water is also calm. */
    restThreshold: number;
    /** seconds of near-stillness (while water is active) before a tide pulse. */
    stalemateSeconds: number;
  };
  pointer: {
    /** radius of the force splat from mouse drag (sim UV units). */
    splatRadius: number;
    /** force multiplier applied to mouse-drag velocity. */
    splatForce: number;
    /** dye injected per splat. */
    dyeAmount: number;
  };
  players: {
    /** marker move speed (uv/s). */
    moveSpeed: number;
    /** marker visual radius. */
    radius: number;
    /** wake force the marker injects as it moves. */
    wakeForce: number;
    /** energy regained per second when not spending. */
    energyRegen: number;
  };
  abilities: {
    pushForce: number;
    pushRadius: number; // uv
    pushCost: number; // energy per activation
    pushCooldown: number; // seconds
    pinchForce: number;
    pinchRadius: number;
    pinchDrain: number; // energy per second while held
    wallRadius: number;
    wallDrain: number; // energy per second while held
    wallMinEnergy: number; // needed to (re)raise a wall
    /** wall-hum note per slot, semitones above the track key root (0+7 = power chord). */
    wallNote0: number;
    wallNote1: number;
  };
  arena: {
    goalInset: number; // goal line distance from the x edge (uv)
    goalHalfHeight: number; // half the goal-mouth height (uv)
    postRadius: number; // goal-post obstacle radius (uv)
  };
  /** goal-mouth look: crisp lip on the goal line + team-colour aura. */
  goalFx: {
    lipWidth: number; // lip half-width (uv x)
    lipBrightness: number;
    auraFalloff: number; // aura e-fold distance into the field (uv x)
    auraStrength: number; // aura brightness (keep well under the lip)
    beatPulse: number; // extra brightness at a full beat
    buildGain: number; // extra brightness at full crescendo
    flashGain: number; // extra brightness on a score
  };
  match: {
    goalsToWin: number;
    goalFreezeSec: number; // pause after a goal before reset
    /** end the match (leader wins) when the track finishes; else play on in silence. */
    endOnTrackEnd: boolean;
  };
  crescendo: {
    /** ability power multiplier added at full intensity (1 -> 1+gain). */
    intensityGain: number;
    /** extra multiplier for a Perfect peak-timed activation (tightest). */
    peakBonusMax: number;
    /** seconds the edge glow ramps BEFORE the audio peak (lookahead). */
    lookahead: number;
    /** wall radius/strength multiplier at full peak power. */
    wallPeakScale: number;
    /** timing window (s) around peakStart that still earns partial credit. */
    gradeWindow: number;
  };
  render: {
    /** device-pixel-ratio cap (quality governor lowers this). */
    maxDpr: number;
    /** overall dye glow intensity. */
    glow: number;
    bloom: number;
  };
}

export const config: TideConfig = {
  sim: {
    simResolution: 196,
    dyeResolution: 1024,
    velocityDissipation: 0.9,
    dyeDissipation: 1.7,
    pressure: 0.8,
    pressureIterations: 24,
    curl: 28,
    dt: 1 / 60,
  },
  ball: {
    radius: 0.045,
    mass: 2.2,
    drag: 9.0,
    damping: 0.9,
    restitution: 0.72,
    wakeForce: 14,
    maxSpeed: 1.1,
    waterDeadzone: 0.03,
    restThreshold: 0.02,
    stalemateSeconds: 4,
  },
  pointer: {
    splatRadius: 0.14,
    splatForce: 6000,
    dyeAmount: 0.11,
  },
  players: {
    moveSpeed: 0.5,
    radius: 0.03,
    wakeForce: 10,
    energyRegen: 0.28,
  },
  abilities: {
    pushForce: 260,
    pushRadius: 0.18,
    pushCost: 0.3,
    pushCooldown: 0.55,
    pinchForce: 200,
    pinchRadius: 0.16,
    pinchDrain: 0.3,
    wallRadius: 0.09,
    wallDrain: 0.35,
    wallMinEnergy: 0.1,
    wallNote0: 0,
    wallNote1: 7,
  },
  arena: {
    goalInset: 0.035,
    goalHalfHeight: 0.16,
    postRadius: 0.028,
  },
  goalFx: {
    lipWidth: 0.0028,
    lipBrightness: 1.6,
    auraFalloff: 0.045,
    auraStrength: 0.5,
    beatPulse: 0.35,
    buildGain: 0.6,
    flashGain: 1.8,
  },
  match: {
    goalsToWin: 5,
    goalFreezeSec: 1.4,
    endOnTrackEnd: false,
  },
  crescendo: {
    intensityGain: 0.6,
    peakBonusMax: 0.8,
    lookahead: 0.6,
    wallPeakScale: 0.7,
    gradeWindow: 0.45,
  },
  render: {
    maxDpr: 2,
    glow: 0.7,
    bloom: 0.7,
  },
};

export type ConfigGroup = keyof TideConfig;
