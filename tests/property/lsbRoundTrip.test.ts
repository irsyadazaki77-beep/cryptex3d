/**
 * Property 9: LSB Round-Trip
 * extract(embed(carrier, payload)) == payload on a 1024x1024 opaque RGBA buffer.
 * Payload sizes are biased small, with some large (up to the 256 000-byte limit).
 *
 * **Validates: Requirements 4.2, 15.4**
 */
import { beforeAll, describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { embed } from '../../src/core/stego/LSBEmbedder';
import { extract } from '../../src/core/stego/LSBExtractor';
import { bytesEqual, LONG_TIMEOUT_MS, makeCarrier, NUM_RUNS, payloadArb } from './helpers';

let carrier: Uint8ClampedArray;
beforeAll(() => {
  carrier = makeCarrier();
});

describe('Property 9: LSB round-trip', () => {
  it('extract(embed(carrier, payload)) equals payload', () => {
    fc.assert(
      fc.property(payloadArb(1, 256_000), (payload) => {
        const stego = embed(carrier, payload);
        expect(stego.length).toBe(carrier.length);
        expect(bytesEqual(extract(stego), payload)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  }, LONG_TIMEOUT_MS);
});
