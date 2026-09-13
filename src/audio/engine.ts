import type { Mood } from '../engine/types';

/**
 * Ambiente sonoro procedural. No carga ningún fichero: todo se sintetiza
 * con la Web Audio API, así que no añade peso ni dependencias.
 */

interface Layer { stop: (at: number) => void }

const MOOD_RECIPES: Record<Mood, { drones: [number, OscillatorType, number][]; noise: [number, number, BiquadFilterType] | null; heartbeat: number | null }> = {
  explore: { drones: [[55, 'sine', 0.05], [82.4, 'sine', 0.035]], noise: [0.035, 700, 'lowpass'], heartbeat: null },
  tense:   { drones: [[49, 'sine', 0.06], [73.4, 'triangle', 0.03]], noise: [0.05, 1400, 'bandpass'], heartbeat: null },
  combat:  { drones: [[41.2, 'sawtooth', 0.05], [61.7, 'sawtooth', 0.03]], noise: [0.07, 2200, 'highpass'], heartbeat: 0.42 },
  rest:    { drones: [[55, 'sine', 0.06], [110, 'sine', 0.035]], noise: [0.05, 420, 'lowpass'], heartbeat: null },
  danger:  { drones: [[36.7, 'sine', 0.08], [55, 'sawtooth', 0.04]], noise: [0.08, 2800, 'highpass'], heartbeat: 0.3 },
  weather: { drones: [[73.4, 'sawtooth', 0.035]], noise: [0.11, 620, 'lowpass'], heartbeat: null },
};

export class AmbientEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private layers: Layer[] = [];
  private beatTimer: number | null = null;
  private generation = 0;

  mood: Mood | null = null;
  enabled = false;
  volume = 0.35;

  private audio(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      return this.ctx;
    } catch {
      return null;
    }
  }

  private drone(freq: number, type: OscillatorType, gain: number): Layer | null {
    const ctx = this.audio();
    if (!ctx || !this.master) return null;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = (Math.random() - 0.5) * 14;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), ctx.currentTime + 2.5);
    osc.connect(g).connect(this.master);
    osc.start();
    return {
      stop: (at) => {
        try {
          g.gain.cancelScheduledValues(ctx.currentTime);
          g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at);
          osc.stop(ctx.currentTime + at + 0.15);
        } catch { /* el nodo ya estaba parado */ }
      },
    };
  }

  private noise(gain: number, cutoff: number, type: BiquadFilterType): Layer | null {
    const ctx = this.audio();
    if (!ctx || !this.master) return null;
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = cutoff;
    filter.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), ctx.currentTime + 3);

    // Un LFO lento mueve el filtro: evita que el ruido suene estático.
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.05 + Math.random() * 0.12;
    lfoGain.gain.value = cutoff * 0.4;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();

    src.connect(filter).connect(g).connect(this.master);
    src.start();
    return {
      stop: (at) => {
        try {
          g.gain.cancelScheduledValues(ctx.currentTime);
          g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at);
          src.stop(ctx.currentTime + at + 0.15);
          lfo.stop(ctx.currentTime + at + 0.15);
        } catch { /* ya parado */ }
      },
    };
  }

  /** Latido sintético. Se cancela por generación, no por comparar funciones. */
  private startHeartbeat(interval: number) {
    const gen = this.generation;
    const tick = () => {
      const ctx = this.audio();
      if (!ctx || !this.master || !this.enabled || gen !== this.generation) return;
      const thump = (freq: number, gain: number, delay: number) => {
        const g = ctx.createGain();
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = ctx.currentTime + delay;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(gain, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        osc.connect(g).connect(this.master!);
        osc.start(t);
        osc.stop(t + 0.24);
      };
      thump(80, 0.13, 0);
      thump(68, 0.09, 0.13);
      this.beatTimer = window.setTimeout(tick, interval * 1000);
    };
    tick();
  }

  private stopAll(fade = 2) {
    if (this.beatTimer !== null) { clearTimeout(this.beatTimer); this.beatTimer = null; }
    for (const l of this.layers) l.stop(fade);
    this.layers = [];
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master && this.ctx) {
      this.master.gain.linearRampToValueAtTime(Math.max(0.0001, v), this.ctx.currentTime + 0.4);
    }
  }

  play(mood: Mood) {
    if (!this.enabled || mood === this.mood) return;
    this.mood = mood;
    this.generation++;
    const gen = this.generation;
    this.stopAll(2);
    window.setTimeout(() => {
      if (!this.enabled || gen !== this.generation) return;
      const recipe = MOOD_RECIPES[mood];
      const layers: Layer[] = [];
      for (const [freq, type, gain] of recipe.drones) {
        const l = this.drone(freq, type, gain);
        if (l) layers.push(l);
      }
      if (recipe.noise) {
        const l = this.noise(...recipe.noise);
        if (l) layers.push(l);
      }
      this.layers = layers;
      if (recipe.heartbeat) this.startHeartbeat(recipe.heartbeat);
    }, 1600);
  }

  async enable(mood: Mood) {
    this.enabled = true;
    const ctx = this.audio();
    if (!ctx) { this.enabled = false; return false; }
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch { /* el navegador aún no permite audio */ }
    }
    this.mood = null;
    this.play(mood);
    return true;
  }

  disable() {
    this.enabled = false;
    this.generation++;
    this.stopAll(1.2);
    this.mood = null;
  }
}

export const ambient = new AmbientEngine();
