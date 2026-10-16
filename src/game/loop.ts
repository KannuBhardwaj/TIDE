/**
 * TideGame — the plain-TS game owner. Creates the GL context, fluid solver,
 * ball, players and match; runs a fixed-timestep loop; injects input + ability
 * forces; stamps wall/post obstacles into the solver; detects goals; and
 * renders the Aurora water pass with players, walls and goals. Lives entirely
 * outside React (see CLAUDE.md golden rules).
 */
import { Blitter, GLContext, Program, createGLContext, programFrom } from '../render/gl';
import { BASE_VERT, DEBUG_FRAG, WATER_FRAG } from '../render/shaders';
import { paletteRgb } from '../render/palette';
import { FluidSolver } from '../sim/fluid';
import { Ball } from '../sim/ball';
import { Obstacles, type Circle } from '../sim/obstacles';
import { Player, NEUTRAL_INPUT, type PlayerInput, type Team } from './player';
import { Match, detectGoal, type MatchState, type GoalGeom } from './match';
import { readKeyboard, GAME_CODES } from './controllers';
import { config } from './config';

export type DebugMode = 'off' | 'velocity' | 'pressure' | 'dye' | 'curl' | 'obstacle';
const DEBUG_CYCLE: DebugMode[] = ['off', 'dye', 'velocity', 'pressure', 'curl', 'obstacle'];

export interface PlayerStat {
  energy: number;
  wall: boolean;
  active: boolean;
}

export interface GameStats {
  fps: number;
  ballSpeed: number;
  debug: DebugMode;
  score: { a: number; b: number };
  state: MatchState;
  winner: Team | null;
  lastScorer: Team | null;
  players: [PlayerStat, PlayerStat];
}

const START_A = { x: 0.25, y: 0.5 };
const START_B = { x: 0.75, y: 0.5 };

export class TideGame {
  private canvas: HTMLCanvasElement;
  private ctx: GLContext;
  private gl: WebGL2RenderingContext;
  private blitter: Blitter;
  private fluid: FluidSolver;
  private obstacles: Obstacles;
  private ball: Ball;
  private players: [Player, Player];
  private match: Match;

  private pWater: Program;
  private pDebug: Program;

  private raf = 0;
  private lastT = 0;
  private acc = 0;
  private startT = performance.now();
  private running = false;

  private debugMode: DebugMode = 'off';
  private fpsEMA = 60;

  // goal moment
  private goalTimer = 0;
  private flashA = 0;
  private flashB = 0;

  // input
  private pointer = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, down: false };
  private codes = new Set<string>();
  /** per-slot input source: 'keyboard' (dev) or 'external' (phone). */
  private inputMode: ['keyboard' | 'external', 'keyboard' | 'external'] = ['keyboard', 'keyboard'];
  private externalInputs: [PlayerInput | null, PlayerInput | null] = [null, null];

  // scratch buffers for array uniforms
  private uPos = new Float32Array(4);
  private uActive = new Float32Array(2);
  private uWall = new Float32Array(2);
  private uEnergy = new Float32Array(2);
  private circles: Circle[] = [];

  onStats?: (s: GameStats) => void;
  onGoal?: (team: Team) => void;
  onPush?: (slot: 0 | 1) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = createGLContext(canvas);
    this.gl = this.ctx.gl;
    this.blitter = new Blitter(this.gl);
    this.resize();

    this.fluid = new FluidSolver(this.ctx, canvas.width, canvas.height);
    this.obstacles = new Obstacles(this.ctx, this.fluid.velocity.width, this.fluid.velocity.height);
    this.ball = new Ball(0.5, 0.5);
    this.players = [
      new Player(0, 'A', START_A.x, START_A.y),
      new Player(1, 'B', START_B.x, START_B.y),
    ];
    this.match = new Match(config.match.goalsToWin);

    this.pWater = programFrom(this.gl, BASE_VERT, WATER_FRAG);
    this.pDebug = programFrom(this.gl, BASE_VERT, DEBUG_FRAG);

    this.seed();
    this.bindInput();
  }

  private splatTealDye(x: number, y: number, strength: number, radius: number) {
    this.fluid.splatDye(x, y, 0.34 * strength, 0.95 * strength, 0.8 * strength, radius);
  }

  private seed() {
    // seed only a little still dye for ambiance — no flow, so the ball rests
    // until a player actually moves the water.
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = 0.5 + Math.cos(a) * 0.26;
      const y = 0.5 + Math.sin(a) * 0.26;
      this.splatTealDye(x, y, 0.16, 26);
    }
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
      return { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height };
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
    });
    const up = () => (this.pointer.down = false);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);

    window.addEventListener('keydown', (e) => {
      if (e.repeat) {
        if (GAME_CODES.has(e.code)) e.preventDefault();
        return;
      }
      if (e.code === 'Backquote') this.cycleDebug();
      else if (e.code === 'KeyR') this.restartMatch();
      else this.codes.add(e.code);
      if (GAME_CODES.has(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.codes.delete(e.code));
    window.addEventListener('resize', () => this.resize());
  }

  cycleDebug() {
    const i = DEBUG_CYCLE.indexOf(this.debugMode);
    this.debugMode = DEBUG_CYCLE[(i + 1) % DEBUG_CYCLE.length];
  }
  setDebug(m: DebugMode) {
    this.debugMode = m;
  }

  private restartMatch() {
    this.match.reset();
    this.resetPositions();
  }

  /** route a slot's input to phone ('external') or keyboard. */
  setInputMode(slot: 0 | 1, mode: 'keyboard' | 'external') {
    this.inputMode[slot] = mode;
    if (mode === 'keyboard') this.externalInputs[slot] = null;
  }

  setExternalInput(slot: 0 | 1, input: PlayerInput | null) {
    this.externalInputs[slot] = input;
  }

  /** snapshot for sending feedback to a phone. */
  playerFeedback(slot: 0 | 1) {
    const p = this.players[slot];
    return {
      energy: p.energy,
      wall: p.wallActive,
      pushReady: p.energy >= config.abilities.pushCost,
      score: { a: this.match.scoreA, b: this.match.scoreB },
      state: this.match.state as string,
    };
  }

  /** dev-only: force a goal (used by the capture tool / manual testing). */
  devScore(team: Team) {
    if (this.match.state === 'ended') return;
    this.match.registerGoal(team);
    if (team === 'A') this.flashA = 1;
    else this.flashB = 1;
    this.goalTimer = config.match.goalFreezeSec;
  }

  private resetPositions() {
    this.ball.reset(0.5, 0.5);
    this.players[0].reset(START_A.x, START_A.y);
    this.players[1].reset(START_B.x, START_B.y);
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
    this.fpsEMA += (1 / Math.max(dtReal, 1e-3) - this.fpsEMA) * 0.1;

    this.handleMouse();

    // goal-freeze / match timing
    if (this.match.state === 'goal') {
      this.goalTimer -= dtReal;
      if (this.goalTimer <= 0) {
        this.resetPositions();
        this.match.resume();
      }
    }

    const step = config.sim.dt;
    this.acc += dtReal;
    let steps = 0;
    const playing = this.match.state === 'playing';
    const kb = readKeyboard(this.codes);
    const inA = this.inputMode[0] === 'external' ? this.externalInputs[0] ?? NEUTRAL_INPUT : kb[0];
    const inB = this.inputMode[1] === 'external' ? this.externalInputs[1] ?? NEUTRAL_INPUT : kb[1];
    while (this.acc >= step && steps < 5) {
      if (playing) {
        this.players[0].update(step, inA, this.fluid);
        this.players[1].update(step, inB, this.fluid);
        if (this.players[0].pushedThisFrame) this.onPush?.(0);
        if (this.players[1].pushedThisFrame) this.onPush?.(1);
        this.injectBallWake();
      }
      this.buildObstacles();
      this.fluid.step(step, this.obstacles.mask);
      if (playing) {
        this.ball.update(step, (u, v, out) => this.fluid.coarse.sample(u, v, out), this.circles);
        if (this.ball.tidePulse) this.tidePulse();
        this.checkGoal();
      }
      this.acc -= step;
      steps++;
    }

    // decay goal flashes
    this.flashA = Math.max(0, this.flashA - dtReal * 2.2);
    this.flashB = Math.max(0, this.flashB - dtReal * 2.2);

    this.render(now);
    this.emitStats();
    this.raf = requestAnimationFrame(this.frame);
  };

  private buildObstacles() {
    const a = config.arena;
    const h = a.goalHalfHeight;
    const list = this.circles;
    list.length = 0;
    // goal posts (always solid)
    list.push({ x: a.goalInset, y: 0.5 - h, r: a.postRadius });
    list.push({ x: a.goalInset, y: 0.5 + h, r: a.postRadius });
    list.push({ x: 1 - a.goalInset, y: 0.5 - h, r: a.postRadius });
    list.push({ x: 1 - a.goalInset, y: 0.5 + h, r: a.postRadius });
    // player walls
    for (const p of this.players) {
      if (p.active && p.wallActive) list.push({ x: p.pos.x, y: p.pos.y, r: config.abilities.wallRadius });
    }
    this.obstacles.circles = list;
    this.obstacles.build();
  }

  private checkGoal() {
    const a = config.arena;
    const geom: GoalGeom = { inset: a.goalInset, half: a.goalHalfHeight };
    const scorer = detectGoal(this.ball.pos.x, this.ball.pos.y, this.ball.radius, geom);
    if (!scorer) return;
    this.match.registerGoal(scorer);
    this.onGoal?.(scorer);
    if (scorer === 'A') this.flashA = 1;
    else this.flashB = 1;
    this.goalTimer = config.match.goalFreezeSec;
    // shockwave-ish burst at the goal mouth
    const gx = scorer === 'A' ? 1 - a.goalInset : a.goalInset;
    this.fluid.splatRadial(gx, 0.5, 0.3, scorer === 'A' ? -220 : 220);
    this.splatTealDye(gx, 0.5, 0.3, 80);
  }

  private injectBallWake() {
    const b = this.ball;
    if (b.speed < 0.02) return;
    const f = config.ball.wakeForce;
    this.fluid.splatVelocity(b.pos.x, b.pos.y, b.vel.x * f, b.vel.y * f, b.radius * 90);
    this.splatTealDye(b.pos.x, b.pos.y, Math.min(b.speed * 0.18, 0.12), b.radius * 80);
  }

  private tidePulse() {
    const a = Math.random() * Math.PI * 2;
    const x = 0.5 + Math.cos(a) * 0.4;
    const y = 0.5 + Math.sin(a) * 0.4;
    this.fluid.splatVelocity(x, y, -Math.cos(a) * 60, -Math.sin(a) * 60, 60);
    this.splatTealDye(x, y, 0.14, 60);
  }

  private handleMouse() {
    const p = this.pointer;
    if (p.down) {
      const dx = (p.x - p.px) * config.pointer.splatForce;
      const dy = (p.y - p.py) * config.pointer.splatForce;
      if (Math.abs(dx) + Math.abs(dy) > 0.001) {
        const radius = config.pointer.splatRadius * 100;
        this.fluid.splatVelocity(p.x, p.y, dx, dy, radius);
        this.splatTealDye(p.x, p.y, config.pointer.dyeAmount * 1.8, radius);
      }
    }
    p.px = p.x;
    p.py = p.y;
  }

  private render(now: number) {
    const gl = this.gl;
    const time = (now - this.startT) / 1000;
    if (this.debugMode !== 'off') {
      this.renderDebug();
      return;
    }

    const p = this.pWater;
    p.bind();
    gl.uniform2f(p.uniforms.texelSize, this.fluid.dye.texelX, this.fluid.dye.texelY);
    gl.uniform1i(p.uniforms.uDye, this.fluid.dye.read.attach(0));
    gl.uniform1i(p.uniforms.uVelocity, this.fluid.velocity.read.attach(1));
    gl.uniform1f(p.uniforms.aspectRatio, this.fluid.aspect);
    gl.uniform1f(p.uniforms.glow, config.render.glow);
    gl.uniform1f(p.uniforms.time, time);
    this.setColor(p, 'cDeep', 'deep');
    this.setColor(p, 'cAbyss', 'abyss');
    this.setColor(p, 'cTeal', 'teal');
    this.setColor(p, 'cRose', 'rose');
    this.setColor(p, 'cPearl', 'pearl');
    this.setColor(p, 'cTeamA', 'gold');
    this.setColor(p, 'cTeamB', 'crimson');

    // ball
    gl.uniform2f(p.uniforms.uBallPos, this.ball.pos.x, this.ball.pos.y);
    gl.uniform1f(p.uniforms.uBallRadius, this.ball.radius);

    // players
    for (let i = 0; i < 2; i++) {
      const pl = this.players[i];
      this.uPos[i * 2] = pl.pos.x;
      this.uPos[i * 2 + 1] = pl.pos.y;
      this.uActive[i] = pl.active ? 1 : 0;
      this.uWall[i] = pl.wallActive ? 1 : 0;
      this.uEnergy[i] = pl.energy;
    }
    gl.uniform2fv(p.uniforms.uPlayerPos, this.uPos);
    gl.uniform1fv(p.uniforms.uPlayerActive, this.uActive);
    gl.uniform1fv(p.uniforms.uPlayerWall, this.uWall);
    gl.uniform1fv(p.uniforms.uPlayerEnergy, this.uEnergy);
    gl.uniform1f(p.uniforms.uPlayerRadius, config.players.radius);
    gl.uniform1f(p.uniforms.uWallRadius, config.abilities.wallRadius);

    // goals
    gl.uniform1f(p.uniforms.uGoalInset, config.arena.goalInset);
    gl.uniform1f(p.uniforms.uGoalHalf, config.arena.goalHalfHeight);
    gl.uniform1f(p.uniforms.uPostRadius, config.arena.postRadius);
    gl.uniform1f(p.uniforms.uGoalFlashA, this.flashA);
    gl.uniform1f(p.uniforms.uGoalFlashB, this.flashB);

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
      case 'obstacle':
        tex = this.obstacles.mask;
        mode = 4;
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

  private emitStats() {
    this.onStats?.({
      fps: Math.round(this.fpsEMA),
      ballSpeed: this.ball.speed,
      debug: this.debugMode,
      score: { a: this.match.scoreA, b: this.match.scoreB },
      state: this.match.state,
      winner: this.match.winner,
      lastScorer: this.match.lastScorer,
      players: [
        { energy: this.players[0].energy, wall: this.players[0].wallActive, active: this.players[0].active },
        { energy: this.players[1].energy, wall: this.players[1].wallActive, active: this.players[1].active },
      ],
    });
  }

  dispose() {
    this.stop();
  }
}
