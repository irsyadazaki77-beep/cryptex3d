/**
 * SpatialMixer: mirrors the camera position onto a PannerNode and a GainNode
 * attenuation (Requirement 8.3). No Three.js dependency: callers feed plain
 * x/y/z numbers via update() or a subscribe function.
 */
import { getAudioEngine, type AudioEngine } from './AudioEngine';

export type CameraPositionCallback = (x: number, y: number, z: number) => void;
export type CameraPositionSubscribe = (cb: CameraPositionCallback) => () => void;

/** Distance (scene units) at which attenuation reaches 50%. */
const REFERENCE_DISTANCE = 8;
const MIN_GAIN = 0.15;

/** Pure attenuation curve: 1 at the origin, decreasing with distance, floored. */
export function attenuationForDistance(distance: number): number {
  if (!Number.isFinite(distance) || distance < 0) return 1;
  const g = 1 / (1 + distance / REFERENCE_DISTANCE);
  return Math.max(MIN_GAIN, Math.min(1, g));
}

export class SpatialMixer {
  private panner: PannerNode | null = null;
  private attenuation: GainNode | null = null;
  private last: [number, number, number] = [0, 0, 0];
  private unsubReady: (() => void) | null = null;
  private unsubCamera: (() => void) | null = null;

  constructor(private readonly engine: AudioEngine = getAudioEngine()) {
    this.unsubReady = this.engine.onReady(() => this.build());
  }

  /** Node other sources should connect into, or null if audio is unavailable. */
  get input(): AudioNode | null {
    return this.panner;
  }

  /** Subscribe to a camera position source. Replaces any previous subscription. */
  connect(subscribe: CameraPositionSubscribe): () => void {
    this.unsubCamera?.();
    this.unsubCamera = subscribe((x, y, z) => this.update(x, y, z));
    return () => {
      this.unsubCamera?.();
      this.unsubCamera = null;
    };
  }

  /** Update the camera position. Safe to call before audio is ready. */
  update(x: number, y: number, z: number): void {
    this.last = [x, y, z];
    this.apply();
  }

  dispose(): void {
    this.unsubReady?.();
    this.unsubCamera?.();
    this.unsubReady = null;
    this.unsubCamera = null;
    try {
      this.panner?.disconnect();
      this.attenuation?.disconnect();
    } catch {
      // ignore
    }
    this.panner = null;
    this.attenuation = null;
  }

  private build(): void {
    const ctx = this.engine.context;
    const master = this.engine.masterGain;
    if (!ctx || !master || this.panner) return;
    try {
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      const attenuation = ctx.createGain();
      panner.connect(attenuation);
      attenuation.connect(master);
      this.panner = panner;
      this.attenuation = attenuation;
      this.apply();
    } catch {
      this.panner = null;
      this.attenuation = null;
    }
  }

  private apply(): void {
    const ctx = this.engine.context;
    if (!ctx || !this.panner || !this.attenuation) return;
    const [x, y, z] = this.last;
    try {
      const t = ctx.currentTime;
      this.panner.positionX.setValueAtTime(x, t);
      this.panner.positionY.setValueAtTime(y, t);
      this.panner.positionZ.setValueAtTime(z, t);
      this.attenuation.gain.setTargetAtTime(
        attenuationForDistance(Math.hypot(x, y, z)),
        t,
        0.05,
      );
    } catch {
      // Audio failures are suppressed silently (Requirement 8.5).
    }
  }
}
