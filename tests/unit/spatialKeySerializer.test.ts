/**
 * Unit tests for SpatialKeySerializer.
 * Validates: Requirements 15.1
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ARTIFACT_STATE_EVENT,
  SERIALIZER_ERROR_EVENT,
  SnapshotValidationError,
  SpatialKeySerializer,
  type ArtifactStateDetail,
  type SerializerErrorDetail,
} from '../../src/scene/SpatialKeySerializer';
import { useVaultStore } from '../../src/store/vaultStore';
import type { SpatialKeySnapshot } from '../../src/store/types';

type Rot = [number, number, number];
const ROT: Rot = [10, 20, 30];
const RING = [0, 1, 2, 3, 4, 5, 6, 7];

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 20));

async function rejection(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  return undefined;
}

describe('SpatialKeySerializer.serialize', () => {
  beforeEach(() => {
    useVaultStore.setState({ spatialKeySnapshot: null });
  });

  it('produces identical 64-char lowercase hex hashes for identical inputs', async () => {
    const s = new SpatialKeySerializer(vi.fn());
    const a = await s.serialize(ROT, RING, true);
    const b = await s.serialize([...ROT] as Rot, [...RING], true);
    expect(a.serializedHash).toMatch(/^[0-9a-f]{64}$/);
    expect(b.serializedHash).toBe(a.serializedHash);
    expect(b).toEqual(a);
  });

  it('produces a different hash when any single field changes', async () => {
    const s = new SpatialKeySerializer(vi.fn());
    const base = (await s.serialize(ROT, RING, false)).serializedHash;
    const variants: Array<[Rot, number[], boolean]> = [
      [[11, 20, 30], RING, false],
      [[10, 21, 30], RING, false],
      [[10, 20, 31], RING, false],
      [ROT, [9, 1, 2, 3, 4, 5, 6, 7], false],
      [ROT, [0, 1, 2, 3, 4, 5, 6, 8], false],
      [ROT, RING, true],
    ];
    const hashes = new Set<string>([base]);
    for (const [r, g, c] of variants) {
      const h = (await s.serialize(r, g, c)).serializedHash;
      expect(h).not.toBe(base);
      hashes.add(h);
    }
    expect(hashes.size).toBe(variants.length + 1);
  });

  describe('validation errors', () => {
    const cases: Array<[string, Rot | unknown, unknown, unknown, string]> = [
      ['rotation X negative', [-1, 0, 0], RING, true, 'monolithRotationX'],
      ['rotation Y equals 360', [0, 360, 0], RING, true, 'monolithRotationY'],
      ['rotation Z above 360', [0, 0, 400], RING, true, 'monolithRotationZ'],
      ['rotation NaN', [NaN, 0, 0], RING, true, 'monolithRotationX'],
      ['rotation tuple wrong length', [0, 0], RING, true, 'monolithRot'],
      ['ring segment above 9', ROT, [0, 1, 2, 3, 4, 5, 6, 10], true, 'ringSegmentPositions[7]'],
      ['ring segment negative', ROT, [-1, 1, 2, 3, 4, 5, 6, 7], true, 'ringSegmentPositions[0]'],
      ['ring segment non-integer', ROT, [0, 1.5, 2, 3, 4, 5, 6, 7], true, 'ringSegmentPositions[1]'],
      ['ring too few segments', ROT, [0, 1, 2, 3, 4, 5, 6], true, 'ringSegmentPositions'],
      ['ring too many segments', ROT, [0, 1, 2, 3, 4, 5, 6, 7, 8], true, 'ringSegmentPositions'],
      ['crystal not boolean', ROT, RING, 1, 'crystalActivated'],
      ['crystal undefined', ROT, RING, undefined, 'crystalActivated'],
    ];

    it.each(cases)('%s throws SnapshotValidationError and leaves store/sink untouched', async (_n, rot, ring, crystal, field) => {
      const sink = vi.fn();
      const s = new SpatialKeySerializer(sink);
      const err = await rejection(s.serialize(rot as Rot, ring as number[], crystal as boolean));
      expect(err).toBeInstanceOf(SnapshotValidationError);
      expect((err as SnapshotValidationError).field).toBe(field);
      expect(sink).not.toHaveBeenCalled();
      expect(useVaultStore.getState().spatialKeySnapshot).toBeNull();
    });

    it('accepts boundary values 0, 359.999, and ring 0/9', async () => {
      const s = new SpatialKeySerializer(vi.fn());
      const snap = await s.serialize([0, 359.999, 0], [0, 9, 0, 9, 0, 9, 0, 9], false);
      expect(snap.serializedHash).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});

describe('SpatialKeySerializer.attach', () => {
  beforeEach(() => {
    useVaultStore.setState({ spatialKeySnapshot: null });
  });

  const fire = (t: EventTarget, detail: unknown): void => {
    t.dispatchEvent(new CustomEvent(ARTIFACT_STATE_EVENT, { detail }));
  };

  it('dispatches a validated snapshot to the injected sink', async () => {
    const sink = vi.fn<(s: SpatialKeySnapshot) => void>();
    const s = new SpatialKeySerializer(sink);
    const target = new EventTarget();
    s.attach(target);
    const detail: ArtifactStateDetail = { monolithRot: ROT, ringSegments: RING, crystalActivated: true };
    fire(target, detail);
    await flush();
    expect(sink).toHaveBeenCalledTimes(1);
    const snap = sink.mock.calls[0][0];
    expect(snap.monolithRotationX).toBe(10);
    expect(snap.ringSegmentPositions).toEqual(RING);
    expect(snap.crystalActivated).toBe(true);
    expect(snap.serializedHash).toMatch(/^[0-9a-f]{64}$/);
    s.detach();
  });

  it('writes to the vault store when no sink is injected', async () => {
    const s = new SpatialKeySerializer();
    const target = new EventTarget();
    s.attach(target);
    fire(target, { monolithRot: ROT, ringSegments: RING, crystalActivated: false });
    await flush();
    expect(useVaultStore.getState().spatialKeySnapshot?.serializedHash).toMatch(/^[0-9a-f]{64}$/);
    s.detach();
  });

  it('emits spatial-key-error with the field name on invalid input and skips the sink', async () => {
    const sink = vi.fn();
    const s = new SpatialKeySerializer(sink);
    const target = new EventTarget();
    const errors: SerializerErrorDetail[] = [];
    target.addEventListener(SERIALIZER_ERROR_EVENT, (e) => {
      errors.push((e as CustomEvent<SerializerErrorDetail>).detail);
    });
    s.attach(target);
    fire(target, { monolithRot: [0, 0, 360], ringSegments: RING, crystalActivated: true });
    await flush();
    expect(sink).not.toHaveBeenCalled();
    expect(useVaultStore.getState().spatialKeySnapshot).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('monolithRotationZ');
    expect(errors[0].message).toEqual(expect.any(String));
    s.detach();
  });

  it('emits spatial-key-error when the event has no detail', async () => {
    const sink = vi.fn();
    const s = new SpatialKeySerializer(sink);
    const target = new EventTarget();
    const errors: SerializerErrorDetail[] = [];
    target.addEventListener(SERIALIZER_ERROR_EVENT, (e) => {
      errors.push((e as CustomEvent<SerializerErrorDetail>).detail);
    });
    s.attach(target);
    target.dispatchEvent(new Event(ARTIFACT_STATE_EVENT));
    await flush();
    expect(sink).not.toHaveBeenCalled();
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('monolithRot');
    s.detach();
  });

  it('stops dispatching after detach()', async () => {
    const sink = vi.fn();
    const s = new SpatialKeySerializer(sink);
    const target = new EventTarget();
    s.attach(target);
    s.detach();
    fire(target, { monolithRot: ROT, ringSegments: RING, crystalActivated: true });
    await flush();
    expect(sink).not.toHaveBeenCalled();
  });
});
