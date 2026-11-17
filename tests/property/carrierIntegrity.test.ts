/**
 * Property 4: Carrier Integrity Detection
 * After embedding, flipping one bit inside the consumed region makes
 * LSBExtractor throw ChecksumFailError and return no bytes.
 *
 * Note on which bits can be flipped: the extractor only reads the LSB of
 * consumed R/G/B bytes. Flipping any other bit (upper bits, alpha, or bytes
 * beyond the bitstream) does not change the covered bitstream, so the checksum
 * cannot and need not detect it. The covered bits are therefore the consumed
 * LSBs, and the test flips one of those. Flips inside the 8-byte magic
 * (bit positions 0..63) are reported as BadMagicError, so they are excluded;
 * flips from the length field onward (bit position 64 and up, including the
 * stored checksum) must raise ChecksumFailError.
 *
 * **Validates: Requirements 4.5, 13.1**
 */
import { beforeAll, describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { embed } from '../../src/core/stego/LSBEmbedder';
import { ChecksumFailError, extract } from '../../src/core/stego/LSBExtractor';
import { bitstreamSize, MAGIC_SIZE } from '../../src/core/stego/BitstreamLayout';
import { LONG_TIMEOUT_MS, makeCarrier, NUM_RUNS, payloadArb } from './helpers';

let carrier: Uint8ClampedArray;
beforeAll(() => {
  carrier = makeCarrier();
});

describe('Property 4: carrier integrity detection', () => {
  it('flipping any covered bit after the magic raises ChecksumFailError', () => {
    fc.assert(
      fc.property(
        payloadArb(1, 20_000),
        fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }),
        (payload, pos) => {
          const stego = embed(carrier, payload);
          const totalBits = bitstreamSize(payload.byteLength) * 8;
          const firstBit = MAGIC_SIZE * 8;
          const bitPos = firstBit + Math.floor(pos * (totalBits - firstBit));
          const byteIndex = Math.floor(bitPos / 3) * 4 + (bitPos % 3);
          stego[byteIndex] ^= 1;

          let result: Uint8Array | undefined;
          let thrown: unknown;
          try {
            result = extract(stego);
          } catch (e) {
            thrown = e;
          }
          expect(thrown).toBeInstanceOf(ChecksumFailError);
          expect(result).toBeUndefined();
        },
      ),
      { numRuns: NUM_RUNS },
    );
  }, LONG_TIMEOUT_MS);

  it('flipping a bit that is not covered (alpha) does not affect extraction', () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const stego = embed(carrier, payload);
    stego[3] ^= 1;
    expect(Array.from(extract(stego))).toEqual([1, 2, 3, 4, 5]);
  });
});
