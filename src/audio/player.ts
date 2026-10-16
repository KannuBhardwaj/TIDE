/**
 * Master music clock + player. AudioContext.currentTime is the single source of
 * truth for all music timing (CLAUDE.md golden rule #2). MusicPlayer loads a
 * track's audio + descriptor, plays it, and exposes the derived crescendo state
 * the game consumes through the MusicRuntime interface.
 */
import { loadTrack, intensityAt, beatPhase, activePeak, type TrackData } from './track';
import { abilityMultiplier, glowIntensity, type GradeLabel } from './grades';

/** what the game reads each frame. Implemented by MusicPlayer; null-safe. */
export interface MusicRuntime {
  time(): number; // track seconds (0 if not playing)
  glow(): number; // 0..1 edge-glow intensity (with lookahead)
  beatPulse(): number; // 0..1 spike on each beat, scaled by intensity
  abilityPower(latencyComp: number): { mult: number; label: GradeLabel };
  peakActive(): boolean;
  accent(): string | undefined;
  title(): string | undefined;
}

export class MusicPlayer implements MusicRuntime {
  track: TrackData | null = null;
  playing = false;
  ended = false;
  onEnded?: () => void;

  private ctx: AudioContext;
  private gain: GainNode;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private startAt = 0; // ctx time when playback began

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0.8;
    this.gain.connect(ctx.destination);
  }

  async load(id: string) {
    this.track = await loadTrack(id);
    const res = await fetch(this.track.audio);
    const arr = await res.arrayBuffer();
    this.buffer = await this.ctx.decodeAudioData(arr);
  }

  get audioBuffer(): AudioBuffer | null {
    return this.buffer;
  }

  play() {
    if (!this.buffer) return;
    this.stop();
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.gain);
    src.onended = () => {
      if (this.playing) {
        this.playing = false;
        this.ended = true;
        this.onEnded?.();
      }
    };
    this.startAt = this.ctx.currentTime;
    src.start();
    this.source = src;
    this.playing = true;
    this.ended = false;
  }

  stop() {
    if (this.source) {
      try {
        this.source.onended = null;
        this.source.stop();
      } catch {
        /* already stopped */
      }
      this.source = null;
    }
    this.playing = false;
  }

  // --- MusicRuntime ---
  time(): number {
    if (!this.playing || !this.track) return 0;
    const t = this.ctx.currentTime - this.startAt;
    return Math.max(0, Math.min(t, this.track.meta.duration));
  }

  glow(): number {
    if (!this.track || !this.playing) return 0;
    return glowIntensity(this.track, this.time());
  }

  beatPulse(): number {
    if (!this.track || !this.playing) return 0;
    const phase = beatPhase(this.track, this.time());
    const spike = Math.pow(1 - phase, 3); // 1 at a beat, decaying
    return spike * intensityAt(this.track, this.time());
  }

  abilityPower(latencyComp: number): { mult: number; label: GradeLabel } {
    if (!this.track || !this.playing) return { mult: 1, label: 'none' };
    const { mult, grade } = abilityMultiplier(this.track, this.time() - latencyComp);
    return { mult, label: grade.label };
  }

  peakActive(): boolean {
    if (!this.track || !this.playing) return false;
    const p = activePeak(this.track, this.time(), 0);
    return !!p && this.time() >= p.peakStart && this.time() <= p.peakEnd;
  }

  accent(): string | undefined {
    return this.track?.meta.accent;
  }

  title(): string | undefined {
    return this.track?.meta.title;
  }

  /** "underwater" low-pass during goal slow-mo (M5 adds the filter; this ducks). */
  duck(amount: number, seconds: number) {
    const now = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setTargetAtTime(0.8 * (1 - amount), now, 0.05);
    this.gain.gain.setTargetAtTime(0.8, now + seconds, 0.1);
  }
}

/** null-object runtime used when no music is loaded. */
export const SILENT_MUSIC: MusicRuntime = {
  time: () => 0,
  glow: () => 0,
  beatPulse: () => 0,
  abilityPower: () => ({ mult: 1, label: 'none' }),
  peakActive: () => false,
  accent: () => undefined,
  title: () => undefined,
};
