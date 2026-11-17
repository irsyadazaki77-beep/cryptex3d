/**
 * AmbientSynthesizer: continuous procedural eerie soundscape built from
 * detuned oscillator pairs routed through a procedurally generated
 * convolution reverb. No external audio files.
 */

import type { AudioEngine } from './AudioEngine';

/** Drone root frequencies (Hz): a dark, dissonant cluster. */
const DRONE_FREQS = [55, 82.41, 116.54];
/** Detune applied to each oscillator of a pair, in cents. */
const DETUNE_CENTS = 9;

/** Build a decaying noise impulse response for the reverb. */
export function generateImpulseResponse(
  ctx: BaseAudioContext,
  seconds = 4,
  decay = 2.5,
): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      // Non-security randomness for audio texture only.
      const noise = Math.random() * 2 - 1;
      data[i] = noise * Math.pow(1 - i / length, decay);
    }
  }
  return buffer;
}

export class AmbientSynthesizer {
  private readonly engine: AudioEngine;
  private unsubscribe: (() => void) | null = null;
  private running = false;
  private disposed = false;

  private oscillators: OscillatorNode[] = [];
  private nodes: AudioNode[] = [];

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Start when the engine is ready. Safe to call repeatedly. */
  start(): void {
    if (this.disposed || this.running || this.unsubscribe) return;
    this.unsubscribe = this.engine.onReady(() => {
      this.unsubscribe = null;
      this.build();
    });
  }

  /** Stop the soundscape and release audio nodes. Can be restarted. */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.teardown();
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
  }

  private build(): void {
    const ctx = this.engine.context;
    const master = this.engine.masterGain;
    if (!ctx || !master || this.running || this.disposed) return;

    try {
      const out = ctx.createGain();
      out.gain.value = 0;
      out.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 4);

      const reverb = ctx.createConvolver();
      reverb.buffer = generateImpulseResponse(ctx);
      const wet = ctx.createGain();
      wet.gain.value = 0.7;
      const dry = ctx.createGain();
      dry.gain.value = 0.3;

      out.connect(dry).connect(master);
      out.connect(reverb).connect(wet).connect(master);
      this.nodes.push(out, reverb, wet, dry);

      DRONE_FREQS.forEach((freq, i) => {
        for (const sign of [-1, 1]) {
          const osc = ctx.createOscillator();
          osc.type = i % 2 === 0 ? 'sine' : 'triangle';
          osc.frequency.value = freq;
          osc.detune.value = sign * DETUNE_CENTS;

          const g = ctx.createGain();
          g.gain.value = 0.18 / (i + 1);

          // Slow LFO modulating detune for an unsettling drift.
          const lfo = ctx.createOscillator();
          lfo.frequency.value = 0.05 + i * 0.037 + (sign > 0 ? 0.011 : 0);
          const lfoGain = ctx.createGain();
          lfoGain.gain.value = 6;
          lfo.connect(lfoGain).connect(osc.detune);

          osc.connect(g).connect(out);
          osc.start();
          lfo.start();
          this.oscillators.push(osc, lfo);
          this.nodes.push(g, lfoGain);
        }
      });

      this.running = true;
    } catch {
      // Audio failures are suppressed silently.
      this.teardown();
    }
  }

  private teardown(): void {
    for (const osc of this.oscillators) {
      try {
        osc.stop();
      } catch {
        // already stopped
      }
      osc.disconnect();
    }
    for (const n of this.nodes) n.disconnect();
    this.oscillators = [];
    this.nodes = [];
    this.running = false;
  }
}
