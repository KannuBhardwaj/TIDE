# Track analysis

Turns a real audio file (mp3/wav/…) into the TIDE track descriptor + an overlay
PNG so you can eyeball the detected timing.

## Setup (Windows / PowerShell)

```powershell
cd tools/analyze
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

(macOS/Linux: `python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`)

## Use

```powershell
python analyze.py ..\..\public\tracks\mysong.mp3 --out ..\..\public\tracks `
  --title "My Song" --accent "#FF8FB0" --key "A minor"
```

Writes `<id>.json` (the descriptor the game loads) and `<id>.waveform.png`
(waveform + teal intensity curve + beat ticks + rose-gold peak windows).

Then drop the matching `mysong.mp3` into `public/tracks/` and the game can play it.

## Hand-editing peaks

Auto peak detection is a heuristic. To override it, put a `<id>.cues.json` next
to the output before (re)running the analyzer, or next to the shipped JSON — both
the analyzer and the game prefer it:

```json
{ "peaks": [ { "buildStart": 48, "peakStart": 56, "peakEnd": 68, "release": 72 } ] }
```

Verify the result by ear + eye in the in-app inspector at **/dev/tracks**.

## No Python?

The procedural placeholder tracks (`npm run gen-track`) need no Python at all —
they ship with correct JSON so the whole game is testable immediately.
