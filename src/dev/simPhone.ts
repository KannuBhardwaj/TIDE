/**
 * Simulated phone for dev: connects to the relay as a real phone would (full
 * net path) and streams input derived from the keyboard, so you can play / test
 * the connection flow without physical devices.
 *
 *   slot 0 (Gold)   : W A S D · Space push · Q pinch · E wall
 *   slot 1 (Crimson): Arrows   · / push · . pinch · , wall
 */
import { PhoneConnection } from '../net/phone';
import { readKeyboard } from '../game/controllers';
import type { Slot } from '../net/protocol';

export class SimPhone {
  readonly conn: PhoneConnection;
  private codes = new Set<string>();
  private raf = 0;
  private down = (e: KeyboardEvent) => this.codes.add(e.code);
  private up = (e: KeyboardEvent) => this.codes.delete(e.code);

  constructor(
    room: string,
    private slot: Slot,
  ) {
    this.conn = new PhoneConnection(room, slot);
    this.conn.onStatus = (s) => {
      if (s === 'connected') this.conn.hello(false, 'sim');
    };
  }

  start() {
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    this.conn.start();
    const loop = () => {
      const inp = readKeyboard(this.codes)[this.slot];
      this.conn.sendInput(inp.joystick, inp.push, inp.pinch, inp.wall);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    window.removeEventListener('keydown', this.down);
    window.removeEventListener('keyup', this.up);
    cancelAnimationFrame(this.raf);
    this.conn.stop();
  }
}
