/**
 * Declarative schema for the live tuning panel. Each field points at a path in
 * the shared `config` object; the panel mutates it in place so changes take
 * effect on the next frame with no reload.
 */
import { config, type TideConfig } from '../game/config';

export interface TuneField {
  label: string;
  group: keyof TideConfig;
  key: string;
  min: number;
  max: number;
  step: number;
}

export interface TuneGroup {
  title: string;
  group: keyof TideConfig;
  fields: TuneField[];
}

const f = (
  group: keyof TideConfig,
  key: string,
  label: string,
  min: number,
  max: number,
  step: number,
): TuneField => ({ group, key, label, min, max, step });

export const TUNING: TuneGroup[] = [
  {
    title: 'Fluid',
    group: 'sim',
    fields: [
      f('sim', 'velocityDissipation', 'Vel. dissipation', 0, 4, 0.05),
      f('sim', 'dyeDissipation', 'Dye dissipation', 0, 4, 0.05),
      f('sim', 'pressure', 'Pressure retain', 0, 1, 0.01),
      f('sim', 'pressureIterations', 'Jacobi iters', 4, 48, 1),
      f('sim', 'curl', 'Vorticity', 0, 60, 1),
    ],
  },
  {
    title: 'Ball',
    group: 'ball',
    fields: [
      f('ball', 'radius', 'Radius', 0.02, 0.1, 0.002),
      f('ball', 'mass', 'Mass', 0.5, 6, 0.1),
      f('ball', 'drag', 'Water drag', 1, 24, 0.5),
      f('ball', 'damping', 'Damping', 0, 3, 0.05),
      f('ball', 'restitution', 'Bounce', 0, 1, 0.02),
      f('ball', 'wakeForce', 'Wake force', 0, 1200, 10),
      f('ball', 'maxSpeed', 'Max speed', 0.4, 3, 0.05),
    ],
  },
  {
    title: 'Pointer',
    group: 'pointer',
    fields: [
      f('pointer', 'splatRadius', 'Splat radius', 0.05, 0.6, 0.01),
      f('pointer', 'splatForce', 'Splat force', 1000, 12000, 100),
      f('pointer', 'dyeAmount', 'Dye amount', 0.02, 0.5, 0.01),
    ],
  },
  {
    title: 'Render',
    group: 'render',
    fields: [
      f('render', 'glow', 'Dye glow', 0, 2, 0.05),
      f('render', 'bloom', 'Bloom', 0, 2, 0.05),
    ],
  },
];

export function getValue(field: TuneField): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (config as any)[field.group][field.key] as number;
}

export function setValue(field: TuneField, value: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (config as any)[field.group][field.key] = value;
}
