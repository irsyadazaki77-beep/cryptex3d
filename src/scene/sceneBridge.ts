/**
 * One-way bridge between the HUD and the render loop. Plain module state, no React and no
 * Three.js types: the HUD writes, the scene reads once per frame (or subscribes to effects).
 * It carries only display data (a carrier's RGBA pixels, which are public ciphertext-in-noise),
 * never passphrases or key material. Replaced or cleared pixel buffers are overwritten.
 */
import { overwriteWithRandom } from '../core/shared/secureWipe';

export interface CarrierPreview {
  /** Raw RGBA, row-major, top row first. */
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  /** LSB bits used by the Cryptex3D payload, or null when the carrier holds none. */
  payloadBits: number | null;
}

export type SceneEffect = 'shatter' | 'ring-seal';

let xray = false;
let preview: CarrierPreview | null = null;
let previewVersion = 0;
let resonance = false;
let glitch = 0;
let version = 0;
const listeners = new Set<() => void>();
const effectListeners = new Set<(e: SceneEffect) => void>();

function changed(): void {
  version++;
  for (const l of [...listeners]) l();
}

/** Subscribe to HUD-visible changes (X-Ray toggle, preview, resonance). Returns an unsubscribe. */
export function subscribeSceneBridge(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Monotonic counter for useSyncExternalStore. */
export function getSceneBridgeVersion(): number {
  return version;
}

export function setXrayLens(on: boolean): void {
  if (xray === on) return;
  xray = on;
  changed();
}
export function getXrayLens(): boolean {
  return xray;
}

/** Replaces (or clears) the carrier shown on the Monolith. The previous pixel buffer is wiped. */
export function setCarrierPreview(next: CarrierPreview | null): void {
  if (preview && preview !== next) overwriteWithRandom(preview.pixels);
  preview = next;
  previewVersion++;
  changed();
}
export function getCarrierPreview(): CarrierPreview | null {
  return preview;
}
/** Bumps whenever the preview changes, so the scene knows when to rebuild its texture. */
export function getCarrierPreviewVersion(): number {
  return previewVersion;
}

/** True while a shard WAV is playing: the crystal resonates. */
export function setCrystalResonance(on: boolean): void {
  if (resonance === on) return;
  resonance = on;
  changed();
}
export function getCrystalResonance(): boolean {
  return resonance;
}

/** 0..1 glitch intensity, written by the shatter effect and read by the compositor and carrier face. */
export function setGlitchLevel(level: number): void {
  glitch = level;
}
export function getGlitchLevel(): number {
  return glitch;
}

export function fireSceneEffect(effect: SceneEffect): void {
  for (const l of [...effectListeners]) l(effect);
}
export function onSceneEffect(listener: (e: SceneEffect) => void): () => void {
  effectListeners.add(listener);
  return () => {
    effectListeners.delete(listener);
  };
}

/** Test helper: restore the module to its initial state. */
export function resetSceneBridge(): void {
  if (preview) overwriteWithRandom(preview.pixels);
  xray = false;
  preview = null;
  previewVersion = 0;
  resonance = false;
  glitch = 0;
  version = 0;
  listeners.clear();
  effectListeners.clear();
}
