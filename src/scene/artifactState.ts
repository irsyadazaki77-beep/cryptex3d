/**
 * Shared artifact state. Monolith, Ring and Crystal each update their own slice and
 * call emit(), which dispatches the full detail so the serializer always sees all values.
 * No React, no store imports.
 */
import { ARTIFACT_STATE_EVENT, RING_SEGMENT_COUNT } from './SpatialKeySerializer';
import type { ArtifactStateDetail } from './SpatialKeySerializer';

/** Normalise an angle in degrees into [0, 360). */
export function normalizeDegrees(deg: number): number {
  const m = deg % 360;
  const r = m < 0 ? m + 360 : m;
  return r >= 360 ? 0 : r;
}

export class ArtifactState {
  private monolithRot: [number, number, number] = [0, 0, 0];
  private ringSegments: number[] = new Array<number>(RING_SEGMENT_COUNT).fill(0);
  private crystalActivated = false;

  /** Degrees; values are normalised into [0, 360). */
  setMonolithRot(rot: [number, number, number]): void {
    this.monolithRot = [normalizeDegrees(rot[0]), normalizeDegrees(rot[1]), normalizeDegrees(rot[2])];
  }

  setRingSegments(segments: readonly number[]): void {
    this.ringSegments = segments.slice();
  }

  setCrystalActivated(v: boolean): void {
    this.crystalActivated = v;
  }

  getDetail(): ArtifactStateDetail {
    return {
      monolithRot: [...this.monolithRot],
      ringSegments: this.ringSegments.slice(),
      crystalActivated: this.crystalActivated,
    };
  }

  /** Dispatch the full state on the target as an 'artifact-state-change' CustomEvent. */
  emit(target: EventTarget): void {
    target.dispatchEvent(new CustomEvent<ArtifactStateDetail>(ARTIFACT_STATE_EVENT, { detail: this.getDetail() }));
  }
}

const states = new WeakMap<EventTarget, ArtifactState>();

/** One ArtifactState per scene event target (registry.events). */
export function getArtifactState(target: EventTarget): ArtifactState {
  let s = states.get(target);
  if (!s) {
    s = new ArtifactState();
    states.set(target, s);
  }
  return s;
}
