# TIDE — Plan

> A two-player, phone-controlled, music-driven fluid-football game.
> The laptop is the arena; two Android phones are the controllers.
> Nobody touches the ball — players move **water**, and the water moves the ball.

Hackathon track: **Vibe** — judged on physics, procedural audio-visuals, and real-time spatial shaders. Judges spend ~60s per entry, so every frame must read as a polished AAA tech demo.

---

## 1. Confirmed decisions (from the brief + Q&A)

| Topic | Decision |
|---|---|
| Network | **Hotspot = primary** (local `ws` relay). **Wired/ADB = failsafe.** Both share the same relay. |
| Cloud backend | **None.** Supabase dropped. Two transports only: `LOCAL` (hotspot) and `USB` (adb reverse → same relay). |
| Phones | Multiple **Android / Chrome**. Wired (ADB) + haptics (navigator.vibrate) fully supported. iPhone = documented degraded guest only. |
| Laptop | RTX 5060 8GB + i7-13650HX, **Chrome**. High default quality tier + quality governor for weaker machines. |
| Win condition | First to **5 goals** or **track end**, whichever is first. Higher score wins. Tie → short sudden-death tide-pulse overtime. |
| Match / track length | ~2–3 minutes. |
| Art direction | **"Aurora Tide"** — see §2. |
| Ball↔fluid coupling | **CPU-side coarse velocity field** (periodic readback of a downsampled velocity texture) — see §4. |
| Pinch control | Hold-button primary; two-finger pinch opt-in if it feels good. |
| Analysis tooling | TS/Web-Audio placeholder+analyzer (zero-dependency path) **and** Python+librosa tool for real tracks. |

## 2. Art direction — "Aurora Tide"

- **Water / base:** midnight teal-black `#04141A` → `#072028`. Auroral green-teal bioluminescent dye, faint rose where water moves fast.
- **Ball:** pearl / opal chrome.
- **Team A — GOLD** `#FFC24B` · **Team B — CRIMSON** `#FF3B5C`. Both pop against the cool water.
- **Crescendo edge glow:** rose-gold aurora curtain building to **white-hot** flare at the peak. No purple anywhere.
- **Type:** humanist serif display + grotesk/mono micro-labels.
- **Grading:** cool shadows, warm highlights, film grain, subtle bloom; per-track palette overrides accent.
- Mood: serene → overwhelming. Liquid light, not a flat blue texture. Awwwards-caliber, not templated.

Tokens live in `src/ui/theme.ts` + Tailwind config; the renderer reads the same hex values from `src/render/palette.ts`.

## 3. Architecture

**Golden rule:** the simulation + render loop live in **plain TypeScript, outside React**. React only renders UI shells (screens, phone UI, panels). No per-frame state ever touches React state. The two communicate through a small event bus + `requestAnimationFrame` loop.

```
src/
  game/      loop (fixed timestep), match state machine, rules, scoring, timing grades, stats
  sim/       fluid solver, obstacle mask, ball physics, coarse-field sampler
  render/    gl helpers, shader passes, water/ball/wall/goal shaders, post chain, palette
  audio/     Web Audio engine, procedural SFX, music master clock, track loader
  net/       transport interface, local-relay client, protocol + schema, connection manager
  phone/     controller UI (/play/:room)
  ui/        screens (intro, lobby, countdown, match HUD, goal, results), theme
  dev/       tuning panel, track inspector (/dev/tracks), debug views, simulated phones
relay/       tiny Node ws relay server
tools/       analyze (python+librosa), gen-track (TS), wired (adb script)
public/tracks/   <id>.mp3 + <id>.json (+ optional <id>.cues.json)
```

**Clocks:** `AudioContext.currentTime` is the single master clock for everything music-related. The sim uses a fixed-timestep accumulator driven by `performance.now()`, re-synced to audio when a track plays.

**Authority:** the laptop is authoritative for all game state. Phones only send input and receive feedback.

## 4. Ball ↔ fluid coupling (the main risk)

Approach: **CPU-side coarse sampled field**, not per-frame full-res GPU readback.

- The sim velocity texture lives on the GPU at sim resolution (e.g. 256²).
- Every N frames (target: every frame at a tiny region, or a full 64×64 downsample a few times/sec) we `readPixels` a **downsampled** velocity target into a CPU `Float32Array`.
- Ball physics runs on CPU against that coarse field (bilinear sample under the ball): drag force `F = k·(v_water − v_ball)`, plus mass/momentum, wall/arena/goal collisions.
- The ball injects a **wake** force splat back into the fluid each frame (two-way coupling) at its position, scaled by its velocity.

**Why:** a full-res GPU→CPU `readPixels` every frame stalls the pipeline. A small downsampled readback is cheap, keeps ball physics **deterministic and unit-testable** on the CPU, and the coarse field is plenty for a heavy ball that should feel smooth, not jittery. Risk if it feels mushy: raise readback cadence / sample a slightly higher-res patch around the ball only.

## 5. Milestones

- **M1 — Fluid + ball core.** Sim + two-way coupling, mouse/keyboard control, tuning panel, debug view. *Accept: looks beautiful, ball feels good.* ← current
- **M2 — Abilities + walls + scoring.** Push, pinch, wall (solver obstacle), energy/cooldowns, goals, scoring. Virtual controllers.
- **M3 — Phones + connection.** Controller UI, QR pairing, LOCAL + USB transports w/ auto fallback, lobby connection UI + help, latency calibration, haptics, reconnect, `npm run wired`.
- **M4 — Music system.** Track format, analyzer + waveform PNG, inspector `/dev/tracks`, master clock, intensity edge glow, peak power scaling, timing grades, procedural placeholder tracks.
- **M5 — Audio.** Full procedural SFX, ducking, key-matching, riser, goal/slow-mo treatment.
- **M6 — Visual polish.** Water/caustics/fresnel, wall/ball/goal shaders, post chain, per-track palettes, shockwaves, intro/lobby/HUD/results/transitions, "how it's built" overlay.
- **M7 — Hardening.** Quality governor, profiling, fallbacks, stalemate handling, error states, README, one-command run, deploy guide, 20s showcase capture.

Stop and show after each milestone.

## 6. Risks & mitigations

- **Ball feel (highest).** → CPU coarse field + live tuning panel + unit tests on physics; budget real tuning time in M1.
- **Float render targets / perf.** → feature-detect `EXT_color_buffer_float`, half-float fallback, quality governor.
- **Hotspot device-to-device blocking.** → wired ADB failsafe designed in from M3, prominent in lobby.
- **iOS gaps (haptics, wake lock, audio unlock).** → Android primary; detect + degrade; document iOS.
- **Scope.** → strict milestone gating; procedural placeholder tracks so the game is testable from day one.

## 7. Dependencies (approved set)

`react`, `react-dom`, `vite`, `typescript`, `tailwindcss`, `gsap`, `zustand`, `qrcode` (render), `ws` (relay), `vitest` (tests), `eslint`/`prettier`. Python: `librosa`, `numpy`, `matplotlib`, `soundfile`. Everything else (fluid, shaders, physics, audio synth) hand-written. Ask before anything heavier.
