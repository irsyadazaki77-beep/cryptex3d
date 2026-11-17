/**
 * Property 5: Payload Size Invariant
 * Any payload larger than 256 000 bytes makes embed throw PayloadTooLargeError
 * and leaves the carrier buffer bitwise identical to its state before the call.
 *
 * **Validates: Requirements 4.6, 15.6**
 */
import { beforeAll, describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { embed, PayloadTooLargeError } from '../../src/core/stego/LSBEmbedder';
import { bytesEqual, bytesFromSeed, LONG_TIMEOUT_MS, makeCarrier, NUM_RUNS } from './helpers';

let carrier: Uint8ClampedArray;
let before: Uint8ClampedArray;
beforeAll(() => {
  carrier = makeCarrier();
  before = new Uint8ClampedArray(carrier);
});

// Biased toward the boundary (256 001) with some much larger payloads.
const oversizeArb = fc
  .record({
    size: fc.oneof(
      { arbitrary: fc.integer({ min: 256_001, max: 256_100 }), weight: 3 },
      { arbitrary: fc.integer({ min: 256_101, max: 600_000 }), weight: 1 },
    ),
    seed: fc.integer({ min: 1, max: 0x7fffffff }),
  })
  .map(({ size, seed }) => bytesFromSeed(size, seed));

describe('Property 5: payload size guard', () => {
  it('payloads over 256000 bytes throw PayloadTooLargeError and leave the carrier unchanged', () => {
    fc.assert(
      fc.property(oversizeArb, (payload) => {
        expect(() => embed(carrier, payload)).toThrow(PayloadTooLargeError);
        expect(bytesEqual(carrier, before)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  }, LONG_TIMEOUT_MS);

  it('a payload of exactly 256000 bytes is accepted', () => {
    expect(() => embed(carrier, bytesFromSeed(256_000, 5))).not.toThrow();
  });
});
