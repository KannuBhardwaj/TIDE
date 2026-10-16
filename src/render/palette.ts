/**
 * Aurora Tide palette. Renderer-side mirror of the UI tokens in src/ui/theme.ts.
 * Values are linear-ish sRGB hex; helpers convert to [0..1] float triples.
 */

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [r, g, b];
}

export const PALETTE = {
  abyss: '#04141A',
  deep: '#072028',
  teal: '#4FE3C1', // auroral dye core
  tealDeep: '#1C8F86',
  rose: '#FF8FB0', // fast-water rose tint
  gold: '#FFC24B', // Team A
  crimson: '#FF3B5C', // Team B
  pearl: '#EAF6F2', // ball / highlights
  roseGold: '#FFC9A3', // crescendo edge glow
} as const;

export type PaletteKey = keyof typeof PALETTE;

export function paletteRgb(key: PaletteKey): [number, number, number] {
  return hexToRgb(PALETTE[key]);
}
