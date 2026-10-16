/**
 * Dev virtual controllers: map a set of held keyboard codes (event.code) to two
 * PlayerInputs. Phones replace these in M3 via the same PlayerInput shape.
 *
 *   Player A (gold, left) :  W A S D move · Space push · Q pinch · E wall
 *   Player B (crimson,right): Arrows move · / push · . pinch · , wall
 *   ` toggles debug view · R resets the match
 */
import type { PlayerInput } from './player';

/** codes we consume for gameplay (so the loop can preventDefault them). */
export const GAME_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyQ', 'KeyE',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Period', 'Comma',
]);

export function readKeyboard(codes: Set<string>): [PlayerInput, PlayerInput] {
  const h = (c: string) => (codes.has(c) ? 1 : 0);
  const a: PlayerInput = {
    joystick: { x: h('KeyD') - h('KeyA'), y: h('KeyW') - h('KeyS') },
    push: codes.has('Space'),
    pinch: codes.has('KeyQ'),
    wall: codes.has('KeyE'),
  };
  const b: PlayerInput = {
    joystick: { x: h('ArrowRight') - h('ArrowLeft'), y: h('ArrowUp') - h('ArrowDown') },
    push: codes.has('Slash'),
    pinch: codes.has('Period'),
    wall: codes.has('Comma'),
  };
  return [a, b];
}
