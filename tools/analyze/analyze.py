#!/usr/bin/env python3
"""
TIDE track analyzer. Turns an audio file into the TIDE JSON descriptor the game
consumes, plus a PNG overlay (waveform + intensity + beats + detected peaks) so
you can eyeball the timing.

    python tools/analyze/analyze.py path/to/song.mp3 --out public/tracks

Outputs next to --out (default: alongside the input):
    <id>.json           the track descriptor
    <id>.waveform.png   the overlay image

Hand-editable peaks: if a <id>.cues.json (with {"peaks":[...]}) sits next to the
output, those peak windows override the auto-detected ones.

Deps: see requirements.txt  (librosa, numpy, matplotlib, soundfile)
"""
import argparse
import json
import os
import sys

import numpy as np

INTENSITY_RATE = 20  # Hz


def smooth(x, win):
    if win <= 1:
        return x
    k = np.ones(win) / win
    return np.convolve(x, k, mode="same")


def detect_peaks(intensity, rate):
    """Heuristic crescendo windows from the intensity envelope."""
    t = np.arange(len(intensity)) / rate
    mx = float(intensity.max()) if len(intensity) else 0.0
    if mx <= 0:
        return []
    hi = 0.72 * mx          # apex threshold
    build_th = 0.42 * mx    # build threshold
    rel_th = 0.5 * mx       # release threshold

    peaks = []
    i = 0
    n = len(intensity)
    while i < n:
        if intensity[i] >= hi:
            # sustain apex region
            start = i
            while i < n and intensity[i] >= hi:
                i += 1
            end = i - 1
            if (t[end] - t[start]) < 0.4:  # ignore blips
                continue
            # build start: walk back until below build threshold
            b = start
            while b > 0 and intensity[b] > build_th:
                b -= 1
            # release: walk forward until below release threshold
            r = end
            while r < n - 1 and intensity[r] > rel_th:
                r += 1
            peaks.append(
                {
                    "buildStart": round(float(t[b]), 3),
                    "peakStart": round(float(t[start]), 3),
                    "peakEnd": round(float(t[end]), 3),
                    "release": round(float(t[r]), 3),
                }
            )
        else:
            i += 1
    return peaks


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--out", default=None, help="output directory")
    ap.add_argument("--id", default=None, help="track id (defaults to filename)")
    ap.add_argument("--title", default=None)
    ap.add_argument("--accent", default="#4FE3C1")
    ap.add_argument("--key", default=None)
    args = ap.parse_args()

    try:
        import librosa
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError as e:
        sys.exit(f"missing dependency: {e}. Run: pip install -r tools/analyze/requirements.txt")

    track_id = args.id or os.path.splitext(os.path.basename(args.audio))[0]
    out_dir = args.out or os.path.dirname(os.path.abspath(args.audio))
    os.makedirs(out_dir, exist_ok=True)

    y, sr = librosa.load(args.audio, mono=True)
    duration = len(y) / sr

    # --- intensity envelope: RMS -> smoothed -> resampled to 20 Hz -> normalized ---
    hop = 512
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    rms_t = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop)
    n_samples = int(duration * INTENSITY_RATE) + 1
    grid = np.linspace(0, duration, n_samples)
    intensity = np.interp(grid, rms_t, rms)
    intensity = smooth(intensity, 5)
    if intensity.max() > 0:
        intensity = intensity / intensity.max()
    intensity = np.clip(intensity, 0, 1)

    # --- beats ---
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    beats = librosa.frames_to_time(beat_frames, sr=sr).tolist()
    bpm = float(np.round(float(tempo)))
    offset = round(float(beats[0]), 3) if beats else 0.0

    # --- peaks (auto, then optional cues override) ---
    peaks = detect_peaks(intensity, INTENSITY_RATE)
    cues_path = os.path.join(out_dir, f"{track_id}.cues.json")
    if os.path.exists(cues_path):
        with open(cues_path) as f:
            cues = json.load(f)
        if isinstance(cues.get("peaks"), list):
            peaks = cues["peaks"]
            print(f"using manual cues from {cues_path}")

    data = {
        "id": track_id,
        "audio": f"/tracks/{os.path.basename(args.audio)}",
        "bpm": bpm,
        "offset": offset,
        "beats": [round(float(b), 3) for b in beats],
        "intensityRate": INTENSITY_RATE,
        "intensity": [round(float(v), 3) for v in intensity],
        "peaks": peaks,
        "meta": {
            "title": args.title or track_id.title(),
            "key": args.key,
            "accent": args.accent,
            "duration": round(duration, 2),
        },
    }

    json_path = os.path.join(out_dir, f"{track_id}.json")
    with open(json_path, "w") as f:
        json.dump(data, f)
    print(f"wrote {json_path}  ({bpm:.0f} bpm, {len(peaks)} peaks, {duration:.1f}s)")

    # --- overlay PNG ---
    fig, ax = plt.subplots(figsize=(14, 4), dpi=110)
    fig.patch.set_facecolor("#04141A")
    ax.set_facecolor("#04141A")
    tt = np.linspace(0, duration, len(y))
    ax.plot(tt, y, color="#EAF6F2", alpha=0.18, linewidth=0.4)
    ax.plot(grid, intensity * 1.0, color="#4FE3C1", linewidth=1.6, label="intensity")
    for b in beats:
        ax.axvline(b, color="#EAF6F2", alpha=0.06, linewidth=0.5)
    for p in peaks:
        ax.axvspan(p["buildStart"], p["release"], color="#FFC9A3", alpha=0.08)
        ax.axvspan(p["peakStart"], p["peakEnd"], color="#FFC9A3", alpha=0.2)
    ax.set_xlim(0, duration)
    ax.set_ylim(-1.05, 1.05)
    ax.tick_params(colors="#EAF6F2")
    for s in ax.spines.values():
        s.set_color("#1C8F86")
    ax.set_title(f"{track_id}  ·  {bpm:.0f} bpm  ·  {len(peaks)} peaks", color="#EAF6F2")
    png_path = os.path.join(out_dir, f"{track_id}.waveform.png")
    fig.tight_layout()
    fig.savefig(png_path, facecolor="#04141A")
    print(f"wrote {png_path}")


if __name__ == "__main__":
    main()
