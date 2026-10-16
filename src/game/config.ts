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
    /** seconds of near-stillness before the anti-stalemate tide pulse. */
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
    stalemateSeconds: 4,
  },
  pointer: {
    splatRadius: 0.14,
    splatForce: 6000,
    dyeAmount: 0.11,
  },
  render: {
    maxDpr: 2,
    glow: 0.7,
    bloom: 0.7,
  },
};

export type ConfigGroup = keyof TideConfig;
