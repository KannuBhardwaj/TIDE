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
import { Post } from '../render/post';
import { Ball, FIELD_TO_WORLD } from '../sim/ball';
import { Obstacles, type Circle } from '../sim/obstacles';
import { Player, NEUTRAL_INPUT, type PlayerInput, type Team } from './player';
import { Match, detectGoal, type MatchState, type GoalGeom } from './match';
import { readKeyboard, GAME_CODES } from './controllers';
import { SILENT_MUSIC, type MusicRuntime } from '../audio/player';
import { hexToRgb } from '../render/palette';
import type { GradeLabel } from '../audio/grades';
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
  result: Team | 'draw' | null;
  lastScorer: Team | null;
  players: [PlayerStat, PlayerStat];
  // crescendo
  glow: number;
  power: number;
  grade: GradeLabel;
  gradeSlot: 0 | 1 | null;
  trackTitle?: string;
  countdown: number; // 0 = none, else seconds left before next kickoff
  shatterCountdown: number; // 0 = none, else seconds left in the shard-drag phase
  quality: number; // governor tier (0 = highest)
}

const START_A = { x: 0.25, y: 0.5 };
const START_B = { x: 0.75, y: 0.5 };

// goal shatter minigame
const SHATTER_SEC = 5; // visible shard-drag phase
const COUNTDOWN_SEC = 3; // kickoff countdown
const SHARD_COUNT = 18;
const SHARD_GRAB_R = 0.16; // within this, a marker directly carries shards

// quality governor tiers (render scale + pressure-solve iterations)
const QUALITY = [
  { scale: 1.0, iters: 24 },
  { scale: 0.82, iters: 18 },
  { scale: 0.68, iters: 14 },
  { scale: 0.55, iters: 10 },
];
interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  angle: number; // formation slot around the carrying marker
  formR: number; // formation radius (keeps shards spread, not glued)
}

export class TideGame {
  private canvas: HTMLCanvasElement;
  private ctx: GLContext;
  private gl: WebGL2RenderingContext;
  private blitter: Blitter;
  private fluid: FluidSolver;
  private post: Post;
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
  private qualityTier = 0;
  private govTimer = 0;

  // goal moment / camera
  private flashA = 0;
  private flashB = 0;
  private shockProgress = 2; // >= 1 inactive
  private shockX = 0.5;
  private shockY = 0.5;
  private shockStr = 0;
  private shakeMag = 0;
  // shatter minigame state
  private shards: Shard[] = [];
  private goalElapsed = 0;
  private countdown = 0;
  private shatterCountdown = 0;
  private uShardPos = new Float32Array(40);
  private uShardSize = new Float32Array(20);
  private scratchVec = { x: 0, y: 0 };

  // music / crescendo
  music: MusicRuntime = SILENT_MUSIC;
  private edgeGlow = 0;
  private beat = 0;
  private power = 1;
  private lastGrade: GradeLabel = 'none';
  private gradeSlot: 0 | 1 | null = null;
  private gradeFlash = 0;
  /** dev override for the edge glow (capture/testing); null = use music. */
  private devGlow: number | null = null;

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
  onPush?: (slot: 0 | 1, x: number, power: number) => void;
  onBallHit?: (x: number, strength: number, kind: 'wall' | 'bound') => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = createGLContext(canvas);
    this.gl = this.ctx.gl;
    this.blitter = new Blitter(this.gl);
    this.resize();

    this.fluid = new FluidSolver(this.ctx, canvas.width, canvas.height);
    this.post = new Post(this.ctx, this.blitter, canvas.width, canvas.height);
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
      this.post?.resize(w, h);
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

  setMusic(m: MusicRuntime) {
    this.music = m;
  }

  /** dev-only: force the edge glow (capture tool); pass null to release. */
  setDevGlow(v: number | null) {
    this.devGlow = v;
  }

  /** end the match because the track finished (leader wins). */
  finishByTrack() {
    if (this.match.state !== 'ended') this.match.finish();
  }

  /** current crescendo edge-glow intensity (for phone feedback). */
  currentGlow() {
    return this.edgeGlow;
  }

  /** per-frame state for the SFX layer. */
  audioState() {
    return {
      glow: this.edgeGlow,
      peak: this.music.peakActive(),
      players: [
        { x: this.players[0].pos.x, wall: this.players[0].wallActive, pinch: this.players[0].pinchActive, active: this.players[0].active },
        { x: this.players[1].pos.x, wall: this.players[1].wallActive, pinch: this.players[1].pinchActive, active: this.players[1].active },
      ] as const,
    };
  }

  private applyQuality() {
    const q = QUALITY[this.qualityTier];
    this.post.setScale(q.scale);
    config.sim.pressureIterations = q.iters;
  }

  private registerGrade(slot: 0 | 1, label: GradeLabel) {
    if (label !== 'none') {
      this.lastGrade = label;
      this.gradeSlot = slot;
      this.gradeFlash = 1;
    }
  }

  /** dev-only: force a goal (used by the capture tool / manual testing). */
  devScore(team: Team) {
    if (this.match.state === 'ended') return;
    this.match.registerGoal(team);
    if (team === 'A') this.flashA = 1;
    else this.flashB = 1;
    this.goalElapsed = 0;
    this.spawnShards(this.ball.pos.x, this.ball.pos.y);
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

    // quality governor: hold >= 60 fps by trading render scale + solver cost.
    // ignore abnormal (stall / tab-hidden) frames so we don't downgrade falsely.
    if (dtReal < 0.045) {
      this.govTimer += dtReal;
      if (this.govTimer > 1.0) {
        this.govTimer = 0;
        if (this.fpsEMA < 58 && this.qualityTier < QUALITY.length - 1) {
          this.qualityTier++;
          this.applyQuality();
        } else if (this.fpsEMA > 75 && this.qualityTier > 0) {
          this.qualityTier--;
          this.applyQuality();
        }
      }
    }

    this.handleMouse();

    // goal shatter sequence: 5s drag (visible countdown) -> 3s kickoff countdown -> reset
    if (this.match.state === 'goal') {
      this.goalElapsed += dtReal;
      const total = SHATTER_SEC + COUNTDOWN_SEC;
      if (this.goalElapsed < SHATTER_SEC) {
        this.shatterCountdown = Math.max(1, Math.ceil(SHATTER_SEC - this.goalElapsed));
        this.countdown = 0;
      } else if (this.goalElapsed < total) {
        this.shatterCountdown = 0;
        this.countdown = Math.max(1, Math.ceil(total - this.goalElapsed));
      } else {
        this.resetPositions();
        this.shards.length = 0;
        this.countdown = 0;
        this.shatterCountdown = 0;
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

    // crescendo state (music is the master clock) + LIVE audio reactivity
    const live = this.music.level();
    this.edgeGlow = this.devGlow ?? Math.max(this.music.glow() * 0.85, live * 0.5);
    this.beat = Math.min(1, this.music.beatPulse() * 0.45 + live * 0.9);
    const powerInfo = this.music.abilityPower(0);
    const power = powerInfo.mult;
    this.power = power;
    this.gradeFlash = Math.max(0, this.gradeFlash - dtReal * 1.5);

    const shatterPhase = this.match.state === 'goal' && this.goalElapsed < SHATTER_SEC;
    const movePlayers = playing || shatterPhase; // players move during shatter to drag shards
    while (this.acc >= step && steps < 5) {
      if (movePlayers) {
        this.players[0].update(step, inA, this.fluid, power);
        this.players[1].update(step, inB, this.fluid, power);
        if (playing) {
          if (this.players[0].pushedThisFrame) {
            this.onPush?.(0, this.players[0].pos.x, power);
            this.registerGrade(0, powerInfo.label);
          }
          if (this.players[1].pushedThisFrame) {
            this.onPush?.(1, this.players[1].pos.x, power);
            this.registerGrade(1, powerInfo.label);
          }
          this.injectBallWake();
        }
      }
      this.buildObstacles();
      this.fluid.step(step, this.obstacles.mask);
      if (playing) {
        this.ball.update(step, (u, v, out) => this.fluid.coarse.sample(u, v, out), this.circles);
        this.collideBallWithPlayers();
        if (this.ball.hitStrength > 0.08 && this.ball.hitKind) {
          this.onBallHit?.(this.ball.pos.x, this.ball.hitStrength, this.ball.hitKind);
          if (this.ball.hitStrength > 0.35) {
            this.shakeMag = Math.max(this.shakeMag, Math.min(this.ball.hitStrength * 0.5, 0.5));
          }
        }
        if (this.ball.tidePulse) this.tidePulse();
        this.checkGoal();
      } else if (shatterPhase) {
        this.updateShards(step);
      }
      this.acc -= step;
      steps++;
    }

    // decay goal flashes + camera effects
    this.flashA = Math.max(0, this.flashA - dtReal * 2.2);
    this.flashB = Math.max(0, this.flashB - dtReal * 2.2);
    if (this.shockProgress < 1) this.shockProgress += dtReal / 0.6;
    this.shakeMag *= Math.exp(-dtReal * 6);

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
    // player walls (effective radius grows at crescendo peaks)
    for (const p of this.players) {
      if (p.active && p.wallActive) list.push({ x: p.pos.x, y: p.pos.y, r: p.wallRadiusEff });
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
    this.goalElapsed = 0;
    this.spawnShards(this.ball.pos.x, this.ball.pos.y);
    // shockwave + shake + fluid burst at the goal mouth
    const gx = scorer === 'A' ? 1 - a.goalInset : a.goalInset;
    this.fluid.splatRadial(gx, 0.5, 0.35, scorer === 'A' ? -260 : 260);
    this.splatTealDye(gx, 0.5, 0.3, 90);
    this.shockX = gx;
    this.shockY = 0.5;
    this.shockProgress = 0;
    this.shockStr = 1;
    this.shakeMag = 0.9;
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

  /** ball is physical vs the player markers: it bounces + takes their momentum. */
  private collideBallWithPlayers() {
    const rest = config.ball.restitution;
    const pr = config.players.radius;
    for (const p of this.players) {
      if (!p.active) continue;
      const min = pr + this.ball.radius;
      let dx = this.ball.pos.x - p.pos.x;
      let dy = this.ball.pos.y - p.pos.y;
      let d = Math.hypot(dx, dy);
      if (d >= min) continue;
      if (d < 1e-5) {
        dx = 1;
        dy = 0;
        d = 1;
      }
      const nx = dx / d;
      const ny = dy / d;
      this.ball.pos.x = p.pos.x + nx * min;
      this.ball.pos.y = p.pos.y + ny * min;
      const vn = (this.ball.vel.x - p.vel.x) * nx + (this.ball.vel.y - p.vel.y) * ny;
      if (vn < 0) {
        this.ball.vel.x -= (1 + rest) * vn * nx;
        this.ball.vel.y -= (1 + rest) * vn * ny;
      }
      // moving the marker into the ball shoves it
      this.ball.vel.x += p.vel.x * 0.6;
      this.ball.vel.y += p.vel.y * 0.6;
      this.shakeMag = Math.max(this.shakeMag, 0.15);
    }
  }

  private spawnShards(x: number, y: number) {
    this.shards = [];
    for (let i = 0; i < SHARD_COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.3 + Math.random() * 0.7;
      this.shards.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        size: 0.012 + Math.random() * 0.013,
        angle: (i / SHARD_COUNT) * Math.PI * 2, // distinct slot so they stay spread
        formR: 0.05 + Math.random() * 0.055,
      });
    }
  }

  /**
   * Only the team that just scored (the winner of the goal) can carry the
   * shards — no tug-of-war. Carried shards each steer toward their own slot in a
   * ring around the marker (so they move with the joystick but stay spread out
   * instead of gluing into one blob). Loose shards drift on the water and are
   * gently drawn toward the winner so they can be gathered.
   */
  private updateShards(dt: number) {
    const tmp = this.scratchVec;
    const scorer = this.match.lastScorer;
    const carrier = scorer === 'A' ? this.players[0] : scorer === 'B' ? this.players[1] : null;
    const carrierActive = !!carrier && carrier.active;

    for (const s of this.shards) {
      let dx = 0;
      let dy = 0;
      let d = Infinity;
      if (carrierActive) {
        dx = carrier!.pos.x - s.x;
        dy = carrier!.pos.y - s.y;
        d = Math.hypot(dx, dy);
      }

      if (carrierActive && d < SHARD_GRAB_R) {
        // carry: steer toward this shard's formation slot around the marker
        const tx = carrier!.pos.x + Math.cos(s.angle) * s.formR - s.x;
        const ty = carrier!.pos.y + Math.sin(s.angle) * s.formR - s.y;
        s.vx += (carrier!.vel.x - s.vx) * 0.35 + tx * 9 * dt;
        s.vy += (carrier!.vel.y - s.vy) * 0.35 + ty * 9 * dt;
      } else {
        // loose: drift on the water + a gentle pull toward the winner's marker
        this.fluid.coarse.sample(s.x, s.y, tmp);
        s.vx += (tmp.x * FIELD_TO_WORLD - s.vx) * 0.12;
        s.vy += (tmp.y * FIELD_TO_WORLD - s.vy) * 0.12;
        if (carrierActive && d < 0.4 && d > 1e-4) {
          const f = (1 - d / 0.4) * 1.3 * dt;
          s.vx += (dx / d) * f;
          s.vy += (dy / d) * f;
        }
      }
      s.vx *= 1 - 0.9 * dt;
      s.vy *= 1 - 0.9 * dt;
      const sp = Math.hypot(s.vx, s.vy);
      if (sp > 1.4) {
        s.vx *= 1.4 / sp;
        s.vy *= 1.4 / sp;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const r = s.size;
      if (s.x < r) { s.x = r; s.vx = Math.abs(s.vx) * 0.5; }
      else if (s.x > 1 - r) { s.x = 1 - r; s.vx = -Math.abs(s.vx) * 0.5; }
      if (s.y < r) { s.y = r; s.vy = Math.abs(s.vy) * 0.5; }
      else if (s.y > 1 - r) { s.y = 1 - r; s.vy = -Math.abs(s.vy) * 0.5; }
      // glowing trail
      this.splatTealDye(s.x, s.y, 0.04, s.size * 90);
    }
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

    // ball (hidden during the goal shatter)
    gl.uniform2f(p.uniforms.uBallPos, this.ball.pos.x, this.ball.pos.y);
    gl.uniform1f(p.uniforms.uBallRadius, this.match.state === 'goal' ? 0 : this.ball.radius);

    // shatter shards
    const n = Math.min(this.shards.length, 20);
    for (let i = 0; i < n; i++) {
      this.uShardPos[i * 2] = this.shards[i].x;
      this.uShardPos[i * 2 + 1] = this.shards[i].y;
      this.uShardSize[i] = this.shards[i].size;
    }
    gl.uniform1i(p.uniforms.uShardCount, n);
    if (n > 0) {
      gl.uniform2fv(p.uniforms.uShardPos, this.uShardPos);
      gl.uniform1fv(p.uniforms.uShardSize, this.uShardSize);
    }

    // players
    for (let i = 0; i < 2; i++) {
      const pl = this.players[i];
      this.uPos[i * 2] = pl.pos.x;
      this.uPos[i * 2 + 1] = pl.pos.y;
      this.uActive[i] = pl.active ? 1 : 0;
      this.uWall[i] = pl.wallActive ? pl.wallRadiusEff : 0;
      this.uEnergy[i] = pl.energy;
    }
    gl.uniform2fv(p.uniforms.uPlayerPos, this.uPos);
    gl.uniform1fv(p.uniforms.uPlayerActive, this.uActive);
    gl.uniform1fv(p.uniforms.uPlayerWall, this.uWall);
    gl.uniform1fv(p.uniforms.uPlayerEnergy, this.uEnergy);
    gl.uniform1f(p.uniforms.uPlayerRadius, config.players.radius);

    // goals
    gl.uniform1f(p.uniforms.uGoalInset, config.arena.goalInset);
    gl.uniform1f(p.uniforms.uGoalHalf, config.arena.goalHalfHeight);
    gl.uniform1f(p.uniforms.uPostRadius, config.arena.postRadius);
    gl.uniform1f(p.uniforms.uGoalFlashA, this.flashA);
    gl.uniform1f(p.uniforms.uGoalFlashB, this.flashB);
    const gfx = config.goalFx;
    gl.uniform1f(p.uniforms.uLipWidth, gfx.lipWidth);
    gl.uniform1f(p.uniforms.uLipBrightness, gfx.lipBrightness);
    gl.uniform1f(p.uniforms.uAuraFalloff, gfx.auraFalloff);
    gl.uniform1f(p.uniforms.uAuraStrength, gfx.auraStrength);
    gl.uniform1f(p.uniforms.uBeatPulse, gfx.beatPulse);
    gl.uniform1f(p.uniforms.uGoalBuild, gfx.buildGain);
    gl.uniform1f(p.uniforms.uGoalFlashGain, gfx.flashGain);

    // crescendo edge glow (rose-gold accent, or the track's accent)
    const accent = this.music.accent();
    const [er, eg, eb] = accent ? hexToRgb(accent) : paletteRgb('roseGold');
    gl.uniform3f(p.uniforms.uEdgeColor, er, eg, eb);
    gl.uniform1f(p.uniforms.uEdgeGlow, this.edgeGlow);
    gl.uniform1f(p.uniforms.uBeat, this.beat);

    // render the water into the scene target, then post-process to screen
    this.blitter.blit(this.post.scene);
    const shockActive = this.shockProgress < 1;
    this.post.render({
      shakeX: (Math.random() - 0.5) * this.shakeMag * 0.02,
      shakeY: (Math.random() - 0.5) * this.shakeMag * 0.02,
      bloom: config.render.bloom,
      ca: 0.3 + this.edgeGlow * 0.9 + (shockActive ? 0.6 : 0),
      grain: 0.035,
      time,
      shockX: this.shockX,
      shockY: this.shockY,
      shockProgress: shockActive ? this.shockProgress : 2,
      shockStr: this.shockStr,
    });
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
      result: this.match.result,
      lastScorer: this.match.lastScorer,
      players: [
        { energy: this.players[0].energy, wall: this.players[0].wallActive, active: this.players[0].active },
        { energy: this.players[1].energy, wall: this.players[1].wallActive, active: this.players[1].active },
      ],
      glow: this.edgeGlow,
      power: this.power,
      grade: this.gradeFlash > 0 ? this.lastGrade : 'none',
      gradeSlot: this.gradeFlash > 0 ? this.gradeSlot : null,
      trackTitle: this.music.title(),
      countdown: this.countdown,
      shatterCountdown: this.shatterCountdown,
      quality: this.qualityTier,
    });
  }

  dispose() {
    this.stop();
  }
}
