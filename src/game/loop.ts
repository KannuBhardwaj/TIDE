/**
 * TideGame — the plain-TS game owner. Creates the GL context, fluid solver and
 * ball, runs a fixed-timestep loop, injects input forces, and renders the
 * Aurora water pass. Lives entirely outside React (see CLAUDE.md golden rules).
 */
import { Blitter, GLContext, Program, createGLContext, programFrom } from '../render/gl';
import { BASE_VERT, DEBUG_FRAG, WATER_FRAG } from '../render/shaders';
import { paletteRgb } from '../render/palette';
import { FluidSolver } from '../sim/fluid';
import { Ball } from '../sim/ball';
import { config } from './config';

export type DebugMode = 'off' | 'velocity' | 'pressure' | 'dye' | 'curl';
const DEBUG_CYCLE: DebugMode[] = ['off', 'dye', 'velocity', 'pressure', 'curl'];

export interface GameStats {
  fps: number;
  ballSpeed: number;
  debug: DebugMode;
}

export class TideGame {
  private canvas: HTMLCanvasElement;
  private ctx: GLContext;
  private gl: WebGL2RenderingContext;
  private blitter: Blitter;
  private fluid: FluidSolver;
  private ball: Ball;

  private pWater: Program;
  private pDebug: Program;

  private raf = 0;
  private lastT = 0;
  private acc = 0;
  private startT = performance.now();
  private running = false;

  private debugMode: DebugMode = 'off';
  private fpsEMA = 60;

  // input
  private pointer = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, down: false, moved: false };
  private keys = new Set<string>();
  private ambientT = 0;

  onStats?: (s: GameStats) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = createGLContext(canvas);
    this.gl = this.ctx.gl;
    this.blitter = new Blitter(this.gl);
    this.resize();

    this.fluid = new FluidSolver(this.ctx, canvas.width, canvas.height);
    this.ball = new Ball(0.5, 0.5);

    this.pWater = programFrom(this.gl, BASE_VERT, WATER_FRAG);
    this.pDebug = programFrom(this.gl, BASE_VERT, DEBUG_FRAG);

    this.seed();
    this.bindInput();
  }

  /** teal bioluminescent dye splat at a given strength (keeps colors in ratio). */
  private splatTealDye(x: number, y: number, strength: number, radius: number) {
    this.fluid.splatDye(x, y, 0.34 * strength, 0.95 * strength, 0.8 * strength, radius);
  }

  /** seed a little dye + gentle motion so the arena looks alive on first frame. */
  private seed() {
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = 0.5 + Math.cos(a) * 0.26;
      const y = 0.5 + Math.sin(a) * 0.26;
      this.splatTealDye(x, y, 0.22, 26);
      this.fluid.splatVelocity(x, y, Math.cos(a) * -14, Math.sin(a) * -14, 24);
    }
    this.splatTealDye(0.5, 0.5, 0.3, 34);
  }

  private resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, config.render.maxDpr);
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private bindInput() {
    const c = this.canvas;
    const toUv = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) / r.width,
        y: 1 - (e.clientY - r.top) / r.height, // flip: uv y up
      };
    };
    c.addEventListener('pointerdown', (e) => {
      const p = toUv(e);
      this.pointer.x = this.pointer.px = p.x;
      this.pointer.y = this.pointer.py = p.y;
      this.pointer.down = true;
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      const p = toUv(e);
      this.pointer.x = p.x;
      this.pointer.y = p.y;
      this.pointer.moved = true;
    });
    const up = () => (this.pointer.down = false);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'd') this.cycleDebug();
      else this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('resize', () => this.resize());
  }

  cycleDebug() {
    const i = DEBUG_CYCLE.indexOf(this.debugMode);
    this.debugMode = DEBUG_CYCLE[(i + 1) % DEBUG_CYCLE.length];
  }

  setDebug(m: DebugMode) {
    this.debugMode = m;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame = (now: number) => {
    if (!this.running) return;
    const dtReal = Math.min((now - this.lastT) / 1000, 0.05);
    this.lastT = now;
    this.fpsEMA += (1000 / Math.max(now - (this.lastT - dtReal * 1000), 1e-3) - this.fpsEMA) * 0.1;

    this.handleInput(dtReal);

    // fixed-timestep sim
    const step = config.sim.dt;
    this.acc += dtReal;
    let steps = 0;
    while (this.acc >= step && steps < 5) {
      this.injectBallWake();
      this.fluid.step(step);
      this.ball.update(step, (u, v, out) => this.fluid.coarse.sample(u, v, out));
      if (this.ball.tidePulse) this.tidePulse();
      this.acc -= step;
      steps++;
    }

    this.render(now);

    this.onStats?.({
      fps: Math.round(this.fpsEMA),
      ballSpeed: this.ball.speed,
      debug: this.debugMode,
    });

    this.raf = requestAnimationFrame(this.frame);
  };

  private handleInput(dt: number) {
    const p = this.pointer;
    const radius = config.pointer.splatRadius * 100;
    // mouse drag -> water force + dye
    if (p.down) {
      const dx = (p.x - p.px) * config.pointer.splatForce;
      const dy = (p.y - p.py) * config.pointer.splatForce;
      if (Math.abs(dx) + Math.abs(dy) > 0.001) {
        this.fluid.splatVelocity(p.x, p.y, dx, dy, radius);
        this.splatTealDye(p.x, p.y, config.pointer.dyeAmount * 1.8, radius);
      }
    }
    p.px = p.x;
    p.py = p.y;

    // keyboard: bat water near the ball (play without a mouse)
    let kx = 0;
    let ky = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) kx -= 1;
    if (this.keys.has('arrowright')) kx += 1; // 'd' is reserved for the debug toggle
    if (this.keys.has('w') || this.keys.has('arrowup')) ky += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) ky -= 1;
    if (kx || ky) {
      const b = this.ball.pos;
      this.fluid.splatVelocity(b.x - kx * 0.08, b.y - ky * 0.08, kx * 90, ky * 90, 24);
      this.splatTealDye(b.x - kx * 0.08, b.y - ky * 0.08, 0.14, 24);
    }

    // ambient life: a rare faint current so the arena breathes (no dye haze)
    this.ambientT += dt;
    if (this.ambientT > 1.6) {
      this.ambientT = 0;
      const x = Math.random();
      const y = Math.random();
      const a = Math.random() * Math.PI * 2;
      this.fluid.splatVelocity(x, y, Math.cos(a) * 10, Math.sin(a) * 10, 36);
    }
  }

  private injectBallWake() {
    const b = this.ball;
    const sp = b.speed;
    if (sp < 0.02) return;
    // push water in the direction of travel (sub-unity gain) + a dye trail
    const f = config.ball.wakeForce;
    this.fluid.splatVelocity(b.pos.x, b.pos.y, b.vel.x * f, b.vel.y * f, b.radius * 90);
    this.splatTealDye(b.pos.x, b.pos.y, Math.min(sp * 0.18, 0.12), b.radius * 80);
  }

  private tidePulse() {
    // gentle nudge from a random edge toward center to break stalemates
    const a = Math.random() * Math.PI * 2;
    const x = 0.5 + Math.cos(a) * 0.4;
    const y = 0.5 + Math.sin(a) * 0.4;
    this.fluid.splatVelocity(x, y, -Math.cos(a) * 60, -Math.sin(a) * 60, 60);
    this.splatTealDye(x, y, 0.16, 60);
  }

  private render(now: number) {
    const gl = this.gl;
    const time = (now - this.startT) / 1000;

    if (this.debugMode !== 'off') {
      this.renderDebug();
      return;
    }

    this.pWater.bind();
    gl.uniform2f(this.pWater.uniforms.texelSize, this.fluid.dye.texelX, this.fluid.dye.texelY);
    gl.uniform1i(this.pWater.uniforms.uDye, this.fluid.dye.read.attach(0));
    gl.uniform1i(this.pWater.uniforms.uVelocity, this.fluid.velocity.read.attach(1));
    gl.uniform1f(this.pWater.uniforms.aspectRatio, this.fluid.aspect);
    gl.uniform1f(this.pWater.uniforms.glow, config.render.glow);
    gl.uniform1f(this.pWater.uniforms.time, time);
    this.setColor(this.pWater, 'cDeep', 'deep');
    this.setColor(this.pWater, 'cAbyss', 'abyss');
    this.setColor(this.pWater, 'cTeal', 'teal');
    this.setColor(this.pWater, 'cRose', 'rose');
    this.setColor(this.pWater, 'cPearl', 'pearl');
    gl.uniform2f(this.pWater.uniforms.uBallPos, this.ball.pos.x, this.ball.pos.y);
    gl.uniform1f(this.pWater.uniforms.uBallRadius, this.ball.radius);
    gl.uniform2f(this.pWater.uniforms.uBallVel, this.ball.vel.x, this.ball.vel.y);
    this.blitter.blit(null);
  }

  private renderDebug() {
    const gl = this.gl;
    this.pDebug.bind();
    let tex = this.fluid.dye.read;
    let mode = 2;
    switch (this.debugMode) {
      case 'velocity':
        tex = this.fluid.velocity.read;
        mode = 0;
        break;
      case 'pressure':
        tex = this.fluid.pressureField;
        mode = 1;
        break;
      case 'curl':
        tex = this.fluid.curlField;
        mode = 3;
        break;
      default:
        tex = this.fluid.dye.read;
        mode = 2;
    }
    gl.uniform2f(this.pDebug.uniforms.texelSize, tex.texelX, tex.texelY);
    gl.uniform1i(this.pDebug.uniforms.uTex, tex.attach(0));
    gl.uniform1i(this.pDebug.uniforms.mode, mode);
    this.blitter.blit(null);
  }

  private setColor(p: Program, uniform: string, key: Parameters<typeof paletteRgb>[0]) {
    const [r, g, b] = paletteRgb(key);
    this.gl.uniform3f(p.uniforms[uniform], r, g, b);
  }

  dispose() {
    this.stop();
  }
}
