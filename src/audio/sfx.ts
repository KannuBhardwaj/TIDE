/**
 * Fully synthesized SFX (no samples). A master bus — reverb send → compressor →
 * limiter → destination — keeps everything glued and clip-free. Tonal sounds
 * pitch to the current track's key so they harmonize with the music; sounds are
 * stereo-panned by screen position. Continuous sounds (wall hum, pinch suction,
 * build riser) are voices you start/update/stop; one-shots auto-release.
 */

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** semitone ratio helper. */
const semi = (n: number) => Math.pow(2, n / 12);

export class SfxEngine {
  private ctx: AudioContext;
  private bus: GainNode; // dry/wet sum point
  private reverbSend: GainNode;
  private comp: DynamicsCompressorNode;
  private limiter: DynamicsCompressorNode;
  private noiseBuf: AudioBuffer;
  private root = 110; // A2 default; set from the track key
  private voices = 0;
  private maxVoices = 28;

  /** optional hook to duck the music under loud SFX. */
  onDuck?: (amount: number, seconds: number) => void;

  // continuous voices keyed by name (e.g. "wall0", "pinch1", "riser")
  private sustained = new Map<string, { stop: () => void; nodes: AudioNode[]; set: (p: Record<string, number>) => void }>();

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.9;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 3;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.18;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -2;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.05;

    // reverb
    const convolver = ctx.createConvolver();
    convolver.buffer = this.makeImpulse(1.8, 2.6);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.25;

    this.bus.connect(this.comp);
    this.reverbSend.connect(convolver);
    convolver.connect(this.comp);
    this.comp.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    this.noiseBuf = this.makeNoise(2);
  }

  setKey(rootHz: number) {
    this.root = rootHz;
  }

  private makeNoise(seconds: number): AudioBuffer {
    const n = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const n = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(2, n, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return buf;
  }

  private panner(x: number): StereoPannerNode {
    const p = this.ctx.createStereoPanner();
    p.pan.value = clamp(x * 2 - 1, -1, 1); // uv x -> -1..1
    return p;
  }

  /** route a node through dry bus + reverb send. */
  private route(node: AudioNode, wet = 0.4) {
    node.connect(this.bus);
    const send = this.ctx.createGain();
    send.gain.value = wet;
    node.connect(send);
    send.connect(this.reverbSend);
  }

  private budget(): boolean {
    if (this.voices >= this.maxVoices) return false;
    this.voices++;
    return true;
  }
  private freeAt(t: number) {
    const dt = Math.max(0, (t - this.ctx.currentTime) * 1000);
    setTimeout(() => (this.voices = Math.max(0, this.voices - 1)), dt + 40);
  }

  private noiseSource(): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    return s;
  }

  // ---------- one-shots ----------

  /** PUSH: filtered-noise whoosh sweeping outward. */
  push(x: number, power = 1) {
    if (!this.budget()) return;
    const t = this.ctx.currentTime;
    const src = this.noiseSource();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(3200 * power, t + 0.22);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * power, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    const pan = this.panner(x);
    src.connect(bp).connect(g).connect(pan);
    this.route(pan, 0.3);
    src.start(t);
    src.stop(t + 0.36);
    this.freeAt(t + 0.36);
    if (power > 1.2) this.onDuck?.(0.15, 0.2);
  }

  /** ball hits a wall/post: resonant thump + click. */
  ballHit(x: number, strength = 1) {
    if (!this.budget()) return;
    const t = this.ctx.currentTime;
    const s = clamp(strength, 0.2, 2);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(180 * s, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.18);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(clamp(0.5 * s, 0.05, 0.7), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    const pan = this.panner(x);
    o.connect(g).connect(pan);
    this.route(pan, 0.4);
    o.start(t);
    o.stop(t + 0.32);
    this.freeAt(t + 0.32);
  }

  /** watery splash: short noise burst. */
  splash(x: number, strength = 1) {
    if (!this.budget()) return;
    const t = this.ctx.currentTime;
    const src = this.noiseSource();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 600;
    const g = this.ctx.createGain();
    const amp = clamp(0.25 * strength, 0.04, 0.4);
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    const pan = this.panner(x);
    src.connect(hp).connect(g).connect(pan);
    this.route(pan, 0.3);
    src.start(t);
    src.stop(t + 0.22);
    this.freeAt(t + 0.22);
  }

  /** goal fanfare: key-rooted chord swell + sub, big reverb. */
  goal(team: 'A' | 'B') {
    const t = this.ctx.currentTime;
    const notes = team === 'A' ? [0, 7, 12, 16] : [0, 5, 12, 15]; // major-ish vs suspended
    notes.forEach((n, i) => {
      if (!this.budget()) return;
      const o = this.ctx.createOscillator();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = this.root * 2 * semi(n);
      const g = this.ctx.createGain();
      const st = t + i * 0.05;
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.22, st + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 1.6);
      o.connect(g);
      this.route(g, 0.6);
      o.start(st);
      o.stop(st + 1.7);
      this.freeAt(st + 1.7);
    });
    // sub
    if (this.budget()) {
      const sub = this.ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.value = this.root;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      sub.connect(g).connect(this.bus);
      sub.start(t);
      sub.stop(t + 1.3);
      this.freeAt(t + 1.3);
    }
    this.onDuck?.(0.4, 1.2);
  }

  /** UI blip. */
  ui(kind: 'tick' | 'confirm' = 'tick') {
    if (!this.budget()) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = kind === 'confirm' ? this.root * 4 : this.root * 3;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.13);
    this.freeAt(t + 0.13);
  }

  // ---------- continuous voices ----------

  /** WALL hum: detuned tonal stack; brighter/higher at the peak. */
  startWall(key: string, x: number) {
    if (this.sustained.has(key)) return;
    const t = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    lp.Q.value = 6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.setTargetAtTime(0.12, t, 0.08);
    const pan = this.panner(x);
    osc1.connect(lp);
    osc2.connect(lp);
    lp.connect(g).connect(pan);
    this.route(pan, 0.3);
    const base = this.root * 1.5;
    osc1.frequency.value = base;
    osc2.frequency.value = base * semi(0.15);
    osc1.start(t);
    osc2.start(t);
    this.sustained.set(key, {
      nodes: [osc1, osc2],
      set: (p) => {
        const now = this.ctx.currentTime;
        const peak = p.peak ?? 0;
        pan.pan.setTargetAtTime(clamp((p.x ?? 0.5) * 2 - 1, -1, 1), now, 0.05);
        osc1.frequency.setTargetAtTime(base * semi(peak * 7), now, 0.06);
        osc2.frequency.setTargetAtTime(base * semi(peak * 7 + 0.15), now, 0.06);
        lp.frequency.setTargetAtTime(600 + peak * 2600, now, 0.06);
        g.gain.setTargetAtTime(0.12 + peak * 0.1, now, 0.08);
      },
      stop: () => {
        const now = this.ctx.currentTime;
        g.gain.setTargetAtTime(0.0001, now, 0.08);
        osc1.stop(now + 0.3);
        osc2.stop(now + 0.3);
      },
    });
  }

  /** PINCH suction: downward-filtered rumble while held. */
  startPinch(key: string, x: number) {
    if (this.sustained.has(key)) return;
    const t = this.ctx.currentTime;
    const src = this.noiseSource();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.Q.value = 4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.setTargetAtTime(0.14, t, 0.05);
    const pan = this.panner(x);
    src.connect(lp).connect(g).connect(pan);
    this.route(pan, 0.25);
    src.start(t);
    let phase = 0;
    this.sustained.set(key, {
      nodes: [src],
      set: (p) => {
        const now = this.ctx.currentTime;
        phase += 0.016;
        pan.pan.setTargetAtTime(clamp((p.x ?? 0.5) * 2 - 1, -1, 1), now, 0.05);
        lp.frequency.setTargetAtTime(500 + Math.sin(phase * 6) * 300, now, 0.03);
      },
      stop: () => {
        const now = this.ctx.currentTime;
        g.gain.setTargetAtTime(0.0001, now, 0.06);
        src.stop(now + 0.2);
      },
    });
  }

  /** build RISER: rising filtered noise whose energy tracks `level` (0..1). */
  setRiser(level: number) {
    const key = 'riser';
    const lv = clamp(level, 0, 1);
    if (lv < 0.02) {
      this.stop(key);
      return;
    }
    if (!this.sustained.has(key)) {
      const t = this.ctx.currentTime;
      const src = this.noiseSource();
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 2;
      const g = this.ctx.createGain();
      g.gain.value = 0.0001;
      src.connect(bp).connect(g);
      this.route(g, 0.4);
      src.start(t);
      this.sustained.set(key, {
        nodes: [src],
        set: (p) => {
          const now = this.ctx.currentTime;
          const l = p.level ?? 0;
          bp.frequency.setTargetAtTime(300 + l * l * 4000, now, 0.08);
          g.gain.setTargetAtTime(0.05 * l, now, 0.08);
        },
        stop: () => {
          const now = this.ctx.currentTime;
          g.gain.setTargetAtTime(0.0001, now, 0.1);
          src.stop(now + 0.25);
        },
      });
    }
    this.sustained.get(key)!.set({ level: lv });
  }

  updateVoice(key: string, params: Record<string, number>) {
    this.sustained.get(key)?.set(params);
  }

  stop(key: string) {
    const v = this.sustained.get(key);
    if (!v) return;
    v.stop();
    this.sustained.delete(key);
  }

  stopAll() {
    for (const k of [...this.sustained.keys()]) this.stop(k);
  }
}
