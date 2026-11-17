/**
 * TactileSFX: short synthesized click per ring position (Requirement 8.4).
 * Pitch maps the 10 ring positions (0..9) to strictly increasing frequencies.
 */
import { getAudioEngine, type AudioEngine } from './AudioEngine';

/** Must match RING_SEGMENT_ROTATED_EVENT in src/scene/artifacts/CryptexRing.ts. */
export const RING_SEGMENT_ROTATED_EVENT_NAME = 'ring-segment-rotated';

export const SEGMENT_COUNT = 10;

const BASE_FREQUENCY_HZ = 330;
/** Semitone offsets of a major pentatonic ladder spanning 10 steps. */
const SEMITONES = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21] as const;

/** Frequency table, strictly increasing, indexed by position 0..9. */
export const SEGMENT_FREQUENCIES: readonly number[] = Object.freeze(
  SEMITONES.map((s) => Math.round(BASE_FREQUENCY_HZ * 2 ** (s / 12) * 100) / 100),
);

/** Frequency (Hz) for position 0..9. Out-of-range values are wrapped modulo 10. */
export function segmentFrequency(index: number): number {
  const i = Number.isFinite(index) ? Math.trunc(index) : 0;
  const wrapped = ((i % SEGMENT_COUNT) + SEGMENT_COUNT) % SEGMENT_COUNT;
  return SEGMENT_FREQUENCIES[wrapped]!;
}

/** Play a short click at the pitch for `index`. No-op if audio is unavailable. */
export function playClick(index: number, engine: AudioEngine = getAudioEngine(), destination?: AudioNode | null): void {
  const ctx = engine.context;
  const out = destination ?? engine.masterGain;
  if (!ctx || !out) return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(segmentFrequency(index), t);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.25, t + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(env);
    env.connect(out);
    osc.onended = () => {
      try {
        osc.disconnect();
        env.disconnect();
      } catch {
        // ignore
      }
    };
    osc.start(t);
    osc.stop(t + 0.07);
  } catch {
    // Suppress silently (Requirement 8.5).
  }
}

/**
 * Play a click on each 'ring-segment-rotated' event ({index, position}); pitch
 * follows `position`. Returns an unsubscribe function.
 */
export function subscribeRingClicks(
  target: EventTarget,
  engine: AudioEngine = getAudioEngine(),
  destination?: () => AudioNode | null,
): () => void {
  const handler = (e: Event): void => {
    const detail = (e as CustomEvent<{ index: number; position: number }>).detail;
    if (!detail || typeof detail.position !== 'number') return;
    playClick(detail.position, engine, destination?.());
  };
  target.addEventListener(RING_SEGMENT_ROTATED_EVENT_NAME, handler);
  return () => target.removeEventListener(RING_SEGMENT_ROTATED_EVENT_NAME, handler);
}
