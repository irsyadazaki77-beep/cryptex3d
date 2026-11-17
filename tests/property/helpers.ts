/**
 * Shared generators and fixtures for property tests. Not a test file
 * (does not match tests/**\/*.test.ts), so Vitest does not collect it.
 */
import * as fc from 'fast-check';
import { SpatialKeySerializer } from '../../src/scene/SpatialKeySerializer';
import type { SpatialKeySnapshot } from '../../src/store/types';

export const NUM_RUNS = 500;
/** Generous per-test timeout (ms): 500 runs with PBKDF2 at 310 000 iterations. */
export const LONG_TIMEOUT_MS = 1_800_000;
export const CARRIER_SIDE = 1024;

/** Raw, unserialized spatial key fields (all within valid ranges). */
export interface KeyFields {
  rot: [number, number, number];
  ring: number[];
  crystal: boolean;
}

/** Rotation in degrees, 3 decimal places, always within [0, 360). Avoids -0. */
const rotArb = fc.integer({ min: 0, max: 359_999 }).map((n) => n / 1000);

export const keyFieldsArb: fc.Arbitrary<KeyFields> = fc.record({
  rot: fc.tuple(rotArb, rotArb, rotArb),
  ring: fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 8, maxLength: 8 }),
  crystal: fc.boolean(),
});

/** 12 mutable "fields": 3 rotations, 8 ring segments, 1 crystal flag. */
export const FIELD_COUNT = 12;

/** Returns a copy of `k` with exactly field `index` changed to a different valid value. */
export function mutateField(k: KeyFields, index: number, delta: number): KeyFields {
  const rot: [number, number, number] = [k.rot[0], k.rot[1], k.rot[2]];
  const ring = k.ring.slice();
  let crystal = k.crystal;
  if (index < 3) {
    // delta in 1..359999 (thousandths of a degree) => new value always differs.
    rot[index] = ((Math.round(rot[index] * 1000) + delta) % 360_000) / 1000;
  } else if (index < 11) {
    // delta in 1..9 => new value always differs.
    ring[index - 3] = (ring[index - 3] + delta) % 10;
  } else {
    crystal = !crystal;
  }
  return { rot, ring, crystal };
}

/** A key plus a one-field mutation of it. */
export const keyPairOneFieldArb = fc
  .record({
    base: keyFieldsArb,
    index: fc.integer({ min: 0, max: FIELD_COUNT - 1 }),
    rotDelta: fc.integer({ min: 1, max: 359_999 }),
    ringDelta: fc.integer({ min: 1, max: 9 }),
  })
  .map(({ base, index, rotDelta, ringDelta }) => ({
    a: base,
    b: mutateField(base, index, index < 3 ? rotDelta : ringDelta),
    index,
  }));

const serializer = new SpatialKeySerializer(() => {});

export function snapshotOf(k: KeyFields): Promise<SpatialKeySnapshot> {
  return serializer.serialize(k.rot, k.ring, k.crystal);
}

/** Passphrase of 8..64 characters (ASCII, so UTF-16 length equals character count). */
export const passphraseArb = fc.string({ minLength: 8, maxLength: 64, unit: 'grapheme-ascii' });

/** Deterministic xorshift32 fill: cheap large payloads, replayable from a seed. */
export function bytesFromSeed(size: number, seed: number): Uint8Array {
  const out = new Uint8Array(size);
  let s = (seed | 0) || 0x9e3779b9;
  for (let i = 0; i < size; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    out[i] = s & 0xff;
  }
  return out;
}

/** 1024x1024 opaque RGBA carrier filled with pseudo-random noise in R, G, B (alpha 255). */
export function makeCarrier(seed = 0x1234abcd): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(CARRIER_SIDE * CARRIER_SIDE * 4);
  let s = seed | 0;
  for (let i = 0; i < buf.length; i += 4) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    buf[i] = s & 0xff;
    buf[i + 1] = (s >>> 8) & 0xff;
    buf[i + 2] = (s >>> 16) & 0xff;
    buf[i + 3] = 255;
  }
  return buf;
}

/** Payload of `size` bytes from a seed; sizes biased small with occasional medium/large. */
export function payloadArb(min: number, max: number): fc.Arbitrary<Uint8Array> {
  const smallMax = Math.min(max, 512);
  const midMax = Math.min(max, 16_384);
  return fc
    .record({
      size: fc.oneof(
        { arbitrary: fc.integer({ min, max: smallMax }), weight: 40 },
        { arbitrary: fc.integer({ min: Math.min(smallMax + 1, max), max: midMax }), weight: 6 },
        { arbitrary: fc.integer({ min: Math.min(midMax + 1, max), max }), weight: 1 },
        { arbitrary: fc.constantFrom(min, max), weight: 2 },
      ),
      seed: fc.integer({ min: 1, max: 0x7fffffff }),
    })
    .map(({ size, seed }) => bytesFromSeed(size, seed));
}

export function bytesEqual(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
