# TIDE

**Move the water, not the ball.**

TIDE is a two-player football game where nobody touches the ball. Each player stirs a
real-time fluid simulation, and the water carries the ball. A laptop runs the arena in
WebGL2, and two phones act as touch controllers. The music drives the match. As a track
builds toward its drop, your abilities get stronger and the arena edge glows rose-gold,
then white-hot.

There's no account, no cloud and no app to install. Everything runs on the laptop, and
the phones connect over a hotspot or a USB cable.

---

## Quick start

You need **[Node.js 20+](https://nodejs.org)** and **Google Chrome**.

```bash
git clone <this repo> tide
cd tide
npm start
```

`npm start` does the whole setup. It installs dependencies on the first run, generates
placeholder music if none exists, starts the relay and the app together, and opens the
arena in your browser. To stop everything, press **Ctrl+C**.

Then:

1. **Begin** on the intro screen. This click also unlocks audio.
2. In the **Lobby**, each player scans their team's QR code (Gold or Crimson) with
   their phone's camera and taps **Tap to join**. Phones must be on the **same Wi-Fi or
   hotspot** as the laptop.
3. Hit **Enter arena**.

> **No phones?** In the lobby, click **add sim phone (dev)** on both slots and play
> from one keyboard. See [Controls](#controls).

> **Windows:** the first time you run it, Windows Firewall asks whether Node.js may
> accept connections. Allow it on **Private networks**, or phones won't be able to
> connect.

---

## How to play

- **Score** by getting the ball into the opponent's goal. Gold defends the left side,
  Crimson the right.
- **First to 5 goals** wins. If the track ends first, the higher score wins, and an
  equal score is a draw.
- **Abilities** cost energy:
  - **Push** (tap) sends a burst of water outward from you, then goes on cooldown.
  - **Pinch** (hold) pulls water, and the ball with it, toward you while it drains energy.
  - **Wall** (hold) raises a solid barrier that the fluid has to flow around.
  - Just moving leaves a wake behind you, so you can steer the ball by swimming near it.
- **Ride the music.** The build-up before a drop powers up your abilities. Time a push
  to land on the beat for a better grade.
- **After a goal**, the scorer has a 5-second shatter round to drag the shards around.
  A 3-second countdown then starts the next kickoff.

### Controls

| | Phone | Keyboard: Gold | Keyboard: Crimson |
|---|---|---|---|
| Move | left thumbstick | `W` `A` `S` `D` | arrow keys |
| Push | **PUSH** | `Space` | `/` |
| Pinch | **PINCH** | `Q` | `.` |
| Wall | **WALL** | `E` | `,` |

| Arena key | Action |
|---|---|
| `R` | restart match |
| `` ` `` (backtick) | cycle debug views: dye → velocity → pressure → curl → obstacles → off |

The arena also has a **tuning panel** in the corner (*hide/show*). It edits physics,
ability and render values live.

---

## Connecting phones

The laptop runs a small WebSocket relay on port **8787** and the app on port **5173**.
Phones can reach them in two ways.

### 1. Wi-Fi or hotspot (default)

Put the laptop and both phones on the same network, then scan the lobby QR codes. The
codes always use the laptop's network address, even if you opened the arena at
`localhost`. The lobby shows which address it picked.

If the venue Wi-Fi blocks devices from talking to each other (common on guest and
campus networks), make a hotspot instead:

- **On the laptop (Windows):** Settings → Network & internet → **Mobile hotspot** → On.
  Join it from both phones.
- **On a phone:** turn on its hotspot and join it from the laptop and the other phone.

After switching networks, reload the arena so the QR codes pick up the new address.

### 2. USB cable (Android fallback)

This works with no network at all, and the phone stays awake during play.

1. Install [Android platform-tools](https://developer.android.com/tools/releases/platform-tools)
   and put `adb` on your PATH. On Windows: `winget install Google.PlatformTools`.
2. On each phone, open **Settings → About phone** and tap **Build number** 7 times.
   Then go to **Developer options** and turn on **USB debugging**.
3. Plug in the phones with a data cable and accept the *Allow USB debugging* prompt.
4. With `npm start` running, open a second terminal and run:

   ```bash
   npm run wired -- --room TIDE
   ```

5. Open the arena at **http://localhost:5173/?room=TIDE**.

`wired` sets up port forwarding (`adb reverse`) and opens the controller on each phone.
The first phone it finds is Gold and the second is Crimson. Use `--slots 1,0` to swap
them. The phone badge shows **USB** once it's connected.

### Phone support

- **Android + Chrome** is fully supported, including haptics.
- **iPhone/Safari** works as a guest controller with no vibration. The screen may
  dim during play, so raise the auto-lock time.
- Over Wi-Fi the controller is served over plain `http`. Some browsers won't keep the
  screen awake in that case. USB mode doesn't have this problem.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `✖ Port 5173 is already in use` | Another dev server is running. The error message prints a command that finds it; stop that server. |
| Phone scans the code but the page never loads | Check that the phone and laptop are on the same network, that the firewall allows Node (see above), and that the network allows device-to-device traffic. If not, use a hotspot or USB. |
| Lobby says *no network address phones can reach* | The laptop isn't on any network. Join or create a hotspot, then reload. |
| Lobby shows `relay: connecting` | The relay isn't running. Use `npm start`, which runs it for you, or run `npm run relay` in another terminal. |
| `adb not found` | Install platform-tools (see above) and reopen the terminal. |
| Device shows as `unauthorized` | Unlock the phone and accept the USB-debugging prompt. |
| Black arena / *WebGL error* | Use desktop Chrome with hardware acceleration on (`chrome://settings/system`). The quality governor scales rendering down on its own if frame time rises. |
| No sound | Click **Begin**. Browsers only allow audio after a click. |

---

## Commands

| Command | What it does |
|---|---|
| `npm start` | **The one you want.** Checks the setup, then runs the relay and the dev server together. |
| `npm start -- --no-open` | The same, without opening a browser. |
| `npm start -- --prod` | Builds, then serves the optimized production bundle (with the relay). |
| `npm run dev` / `npm run relay` | Runs the app or the relay on its own (one terminal each). |
| `npm run wired -- --room TIDE` | Connects Android phones over USB. |
| `npm run gen-track` | Regenerates the procedural placeholder tracks. |
| `npm test` | Runs the unit tests (vitest). |
| `npm run typecheck` · `npm run lint` | Runs strict TypeScript and ESLint checks. |
| `npm run build` | Builds production output into `dist/`. |

Pages: `/` is the arena, `/play/:room` is the phone controller, and `/dev/tracks` is the
track inspector (waveform, beats, peaks).

The relay port can be changed with `RELAY_PORT=9000`. The app port is fixed at 5173
because the phones and `npm run wired` expect it.

---

## Music

Tracks live in `public/tracks/` as an audio file plus a `<id>.json` descriptor (BPM,
beats, intensity curve, peak windows). Three tracks ship with the repo: `rising_tide`
(the default) and the procedural `aurora` and `surge`.

**Add your own track.** You need Python 3.10+. Full details are in
[`tools/analyze/README.md`](tools/analyze/README.md).

```bash
cd tools/analyze
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python analyze.py ../../public/tracks/mysong.mp3 --out ../../public/tracks --title "My Song"
```

Then open `/dev/tracks` to check the detected peaks by ear and by eye. You can override
them by hand with a `<id>.cues.json` file.

---

## How it's built

- **Fluid:** a hand-written GPU Navier–Stokes solver (advection, vorticity confinement,
  pressure projection) in WebGL2 fragment shaders. Walls are obstacles inside the solver.
- **Ball ↔ water coupling:** a small downsampled velocity field is read back to the CPU.
  Ball physics samples that field (drag toward the water's velocity), and the ball
  feeds its own wake back into the fluid. This keeps the ball physics deterministic
  and unit-tested.
- **Music:** `AudioContext.currentTime` is the master clock for beats, timing grades,
  the crescendo and the edge glow. Sound effects are synthesized on the fly and tuned
  to the track's key.
- **Networking:** a ~150-line Node `ws` relay. The laptop holds the authoritative game
  state, and phones send only input. Every inbound message is checked against a schema.
- **Procedural everything:** the look comes from shaders and the sounds are
  synthesized, so there are no texture or sample files.

```
src/
  game/    fixed-timestep loop, match rules, scoring, controllers, config (all tunables)
  sim/     fluid solver, obstacles, ball physics, coarse-field sampler
  render/  WebGL helpers, shaders, post-processing, palette
  audio/   music player + clock, track loader, timing grades, procedural SFX
  net/     relay client, protocol + schema, host/phone connections
  phone/   controller UI
  ui/      intro, lobby, arena, HUD
  dev/     tuning panel, track inspector, simulated phones
relay/     WebSocket relay server
tools/     start (launcher), wired (adb), gen-track, analyze (python), capture (playwright)
```

[`PLAN.md`](PLAN.md) covers the architecture and milestones, and
[`CLAUDE.md`](CLAUDE.md) has the contributor conventions.
