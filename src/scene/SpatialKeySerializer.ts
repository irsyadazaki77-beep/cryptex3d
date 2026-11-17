/**
 * SpatialKeySerializer: pure serializer for artifact state. No Three.js imports.
 * Listens to a scene EventTarget and writes validated snapshots to the VaultStore.
 */
import type { SpatialKeySnapshot } from '../store/types';
import { useVaultStore } from '../store/vaultStore';

export const RING_SEGMENT_COUNT = 8;
export const RING_MAX_POSITION = 9;

/** Event name the scene dispatches on any artifact state change. */
export const ARTIFACT_STATE_EVENT = 'artifact-state-change';
/** Event name this serializer dispatches on the same target when validation fails. */
export const SERIALIZER_ERROR_EVENT = 'spatial-key-error';

export interface ArtifactStateDetail {
  /** Monolith Euler angles in degrees, each in [0, 360). */
  monolithRot: [number, number, number];
  /** 8 ring segment positions, each an integer 0-9. */
  ringSegments: number[];
  crystalActivated: boolean;
}

export interface SerializerErrorDetail {
  field: string;
  message: string;
}

export class SnapshotValidationError extends Error {
  readonly field: string;
  constructor(field: string, message?: string) {
    super(message ?? `Invalid spatial key field: ${field}`);
    this.name = 'SnapshotValidationError';
    this.field = field;
  }
}

export type SnapshotSink = (snapshot: SpatialKeySnapshot) => void;

const ROT_FIELDS = ['monolithRotationX', 'monolithRotationY', 'monolithRotationZ'] as const;

function validateRotation(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 360) {
    throw new SnapshotValidationError(field);
  }
  return value;
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

export class SpatialKeySerializer {
  private readonly sink: SnapshotSink;
  private target: EventTarget | null = null;
  private seq = 0;

  constructor(sink?: SnapshotSink) {
    this.sink = sink ?? ((s) => useVaultStore.getState().setSpatialKeySnapshot(s));
  }

  /**
   * Validates inputs and returns a snapshot with its SHA-256 hash.
   * Async because crypto.subtle.digest is async. Rejects with SnapshotValidationError.
   */
  async serialize(
    monolithRot: [number, number, number],
    ringSegments: number[],
    crystalActivated: boolean,
  ): Promise<SpatialKeySnapshot> {
    if (!Array.isArray(monolithRot) || monolithRot.length !== 3) {
      throw new SnapshotValidationError('monolithRot');
    }
    const rx = validateRotation(monolithRot[0], ROT_FIELDS[0]);
    const ry = validateRotation(monolithRot[1], ROT_FIELDS[1]);
    const rz = validateRotation(monolithRot[2], ROT_FIELDS[2]);

    if (!Array.isArray(ringSegments) || ringSegments.length !== RING_SEGMENT_COUNT) {
      throw new SnapshotValidationError('ringSegmentPositions');
    }
    const ring: number[] = [];
    for (let i = 0; i < RING_SEGMENT_COUNT; i++) {
      const v = ringSegments[i];
      if (!Number.isInteger(v) || v < 0 || v > RING_MAX_POSITION) {
        throw new SnapshotValidationError(`ringSegmentPositions[${i}]`);
      }
      ring.push(v);
    }

    if (typeof crystalActivated !== 'boolean') {
      throw new SnapshotValidationError('crystalActivated');
    }

    // Fixed key order; JSON.stringify preserves insertion order for string keys.
    const json = JSON.stringify({
      monolithRotationX: rx,
      monolithRotationY: ry,
      monolithRotationZ: rz,
      ringSegmentPositions: ring,
      crystalActivated,
    });
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));

    return {
      monolithRotationX: rx,
      monolithRotationY: ry,
      monolithRotationZ: rz,
      ringSegmentPositions: ring,
      crystalActivated,
      serializedHash: toHex(new Uint8Array(digest)),
    };
  }

  /** Subscribe to artifact state-change events on a scene EventTarget. */
  attach(target: EventTarget): void {
    this.detach();
    this.target = target;
    target.addEventListener(ARTIFACT_STATE_EVENT, this.onEvent);
  }

  detach(): void {
    this.target?.removeEventListener(ARTIFACT_STATE_EVENT, this.onEvent);
    this.target = null;
    this.seq++; // drop any in-flight results
  }

  private readonly onEvent = (evt: Event): void => {
    const target = this.target;
    const detail = (evt as CustomEvent<ArtifactStateDetail>).detail;
    const id = ++this.seq;
    void (async () => {
      try {
        const snap = await this.serialize(
          detail?.monolithRot,
          detail?.ringSegments,
          detail?.crystalActivated,
        );
        // Discard if superseded by a newer event or detached.
        if (id !== this.seq || this.target !== target) return;
        this.sink(snap);
      } catch (err) {
        if (!target || id !== this.seq) return;
        const field = err instanceof SnapshotValidationError ? err.field : 'unknown';
        const message = err instanceof SnapshotValidationError ? err.message : 'Serialization failed';
        target.dispatchEvent(
          new CustomEvent<SerializerErrorDetail>(SERIALIZER_ERROR_EVENT, {
            detail: { field, message },
          }),
        );
      }
    })();
  };
}
