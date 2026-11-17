/**
 * Property 6: Losslessness Invariant
 * After embed, only the least significant bit of consumed R/G/B bytes may
 * differ from the original carrier. Every other bit of R/G/B bytes, every bit
 * of unconsumed R/G/B bytes, and all alpha bytes are identical.
 *
 * Consumed slots are the first (bitstreamSize * 8) R,G,B bytes in pixel order.
 *
 * **Validates: Requirements 4.3**
 */
import { beforeAll, describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { embed } from '../../src/core/stego/LSBEmbedder';
import { bitstreamSize } from '../../src/core/stego/BitstreamLayout';
import { LONG_TIMEOUT_MS, makeCarrier, NUM_RUNS, payloadArb } from './helpers';

let carrier: Uint8ClampedArray;
beforeAll(() => {
  carrier = makeCarrier();
});

describe('Property 6: losslessness invariant', () => {
  it('only LSBs of consumed R/G/B bytes change; alpha and upper bits are untouched', () => {
    fc.assert(
      fc.property(payloadArb(1, 256_000), (payload) => {
        const stego = embed(carrier, payload);
        const consumedSlots = bitstreamSize(payload.byteLength) * 8;
        let violations = 0;
        for (let i = 0; i < carrier.length; i++) {
          const isAlpha = (i & 3) === 3;
          const slot = (i >> 2) * 3 + (i & 3); // valid only when !isAlpha
          const mask = !isAlpha && slot < consumedSlots ? 0xfe : 0xff;
          if ((carrier[i] & mask) !== (stego[i] & mask)) violations++;
        }
        expect(violations).toBe(0);
      }),
      { numRuns: NUM_RUNS },
    );
  }, LONG_TIMEOUT_MS);
});
