/**
 * Plays a shard WAV through the shared AudioEngine using Web Audio only. (An <audio> element
 * with a blob: URL would be blocked by the CSP's default-src 'self'.) Failures are silent,
 * like the rest of the audio layer. No React, no Three.js.
 */
import { getAudioEngine } from './AudioEngine';

export interface ShardPlayback {
  stop(): void;
}

/**
 * Starts playback; resolves to a handle, or null when audio is unavailable. `onEnded` fires
 * once, on natural end or after `stop()`.
 */
export async function playWavBytes(wav: Uint8Array, onEnded: () => void): Promise<ShardPlayback | null> {
  const engine = getAudioEngine();
  const ctx = engine.context;
  const master = engine.masterGain;
  if (!ctx || !master) return null;
  try {
    // decodeAudioData detaches its input, so give it a copy.
    const buffer = await ctx.decodeAudioData(wav.slice().buffer);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.7;
    source.connect(gain);
    gain.connect(master);
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      try {
        source.disconnect();
        gain.disconnect();
      } catch {
        // already disconnected
      }
      onEnded();
    };
    source.onended = finish;
    source.start();
    return {
      stop: () => {
        try {
          source.stop();
        } catch {
          // not started or already stopped
        }
        finish();
      },
    };
  } catch {
    return null;
  }
}
