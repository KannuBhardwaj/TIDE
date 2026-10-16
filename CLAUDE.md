# CLAUDE.md — TIDE conventions

Project context and house rules. Read `PLAN.md` for architecture and milestones.

## What this is
Two-player, phone-controlled, music-driven fluid-football. Laptop = arena (WebGL2), two Android phones = touch controllers over a local `ws` relay (hotspot primary, USB/adb failsafe). No cloud backend.

## Commands
```bash
npm install          # install deps
npm run dev          # Vite dev server (arena at /, phone at /play/:room, dev at /dev/*)
npm run relay        # start the local ws relay server
npm run wired        # detect Android devices, adb reverse ports, launch controllers (M3+)
npm run build        # production build
npm run preview      # preview prod build
npm test             # vitest (pure-logic unit tests)
npm run lint         # eslint
npm run typecheck    # tsc --noEmit

# tracks
npm run gen-track    # generate procedural placeholder tracks + JSON (TS, no python)
python tools/analyze/analyze.py <audio>   # real-track analysis -> <id>.json + waveform.png
```

## Golden rules
1. **The sim + render loop live outside React, in plain TS.** React renders UI only. **Never** put per-frame state (ball pos, velocity fields, sim step) in React state/hooks. Communicate via the event bus + rAF loop.
2. **One master clock:** `AudioContext.currentTime` for anything music-related. Sim uses a fixed-timestep accumulator.
3. **Laptop is authoritative.** Phones send input, receive feedback. Validate every inbound message against a schema.
4. **All tunable numbers live in one typed config** (`src/game/config.ts`) and are editable live via the tuning panel. No magic numbers scattered in modules.
5. **Procedural over assets.** No baked textures where a shader can do it. No image/audio-sample files for the look or SFX.
6. **Strict TS.** `strict: true`, no `any` without a comment justifying it. Pure logic (scoring, timing grades, track-JSON parse, message schema, transport fallback) gets unit tests.

## Art direction — "Aurora Tide"
Midnight teal-black water (`#04141A`→`#072028`), auroral green-teal dye, pearl/opal ball. Team A GOLD `#FFC24B`, Team B CRIMSON `#FF3B5C`. Crescendo edge glow = rose-gold → white-hot (no purple, no AI-slop gradients). Tokens: `src/ui/theme.ts` (UI) + `src/render/palette.ts` (renderer) — keep them in sync. Aim Awwwards-caliber; avoid generic/templated looks.

## Code style
- TypeScript, 2-space indent, Prettier-formatted.
- GLSL in `.glsl` files or tagged template strings under `src/render/shaders/`.
- Prefer small, understood modules over frameworks. Ask before adding any heavy dependency.
- Match surrounding code's naming/idiom/comment density.

## Verification workflow
- After each milestone: run the app, verify it works, **take Playwright screenshots/short recordings and review them yourself**; fix anything flat/ugly/aliased/low-energy before showing the user.
- Keep debug view (key **D**) working — it's shown to judges.

## Perf targets
- ~60 fps on the RTX 5060 rig at high quality. Quality governor auto-downgrades render scale / sim res / bloom if frame time rises. Manual quality setting also available.

## Platform notes (Windows dev box)
- Node 20, npm 10. Shell is PowerShell (no `&&` chaining; use `;` / `if ($?)`).
- Git: installed via winget (`Git.Git`). Commit often, clear messages.
- Scratchpad for temp files: `%LOCALAPPDATA%\Temp\claude\...\scratchpad`.
