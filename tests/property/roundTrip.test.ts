/**
 * Property 1: Round-Trip Fidelity
 *
 * For any payload P, passphrase S (8..64 chars) and SpatialKeySnapshot K:
 *   decrypt(extract(embed(carrier, encrypt(P, S, K))), S, K) == P
 *
 * Driven through the real pure handlers: handleCryptoMessage (encrypt/decrypt),
 * packPayload/unpackPayload, and LSBEmbedder/LSBExtractor on a raw 1024x1024
 * opaque RGBA Uint8ClampedArray.
 *
 * Deliberate deviations:
 *  - The PNG encode/decode step is skipped: no PNG codec is available in Node.
 *    PNG is lossless, so the pixel buffer is what the real pipeline carries.
 *  - Plaintext length is capped at MAX_CIPHERTEXT_BYTES (255 956), not 256 000.
 *    AES-GCM ciphertext is the same length as plaintext, and the 44-byte packed
 *    blob (iv + salt + ciphertext + tag) must fit the 256 000-byte embed limit.
 *  - A small pool of passphrase/spatial-key combos is shared across runs to
 *    bound PBKDF2 cost. Every run still performs a full encrypt, pack, embed,
 *    extract, unpack and decrypt (fresh random IV per run).
 *
 * Wrong-key rejection and spatial key sensitivity are covered elsewhere
 * (tasks 3.2 / 3.3 / 4.5) and intentionally not tested here.
 *
 * **Validates: Requirements 3.6, 15.3**
 */
import { beforeAll, describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { handleCryptoMessage } from '../../src/core/crypto/CryptoWorker';
import type {
  DecryptResponsePayload,
  EncryptResponsePayload,
} from '../../src/core/crypto/CryptoWorker';
import { embed } from '../../src/core/stego/LSBEmbedder';
import { extract } from '../../src/core/stego/LSBExtractor';
import {
  MAX_CIPHERTEXT_BYTES,
  packPayload,
  unpackPayload,
} from '../../src/core/stego/payloadPacking';
import { SpatialKeySerializer } from '../../src/scene/SpatialKeySerializer';
import type { SpatialKeySnapshot } from '../../src/store/types';

const CARRIER_SIDE = 1024;
const POOL_SIZE = 4;
const NUM_RUNS = 500;
const TEST_TIMEOUT_MS = 900_000;

interface Combo {
  passphrase: string;
  key: SpatialKeySnapshot;
}

/** Deterministic xorshift32 fill so large payloads are cheap to generate and replay from a seed. */
function bytesFromSeed(size: number, seed: number): Uint8Array {
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

/** Opaque RGBA carrier (alpha 255) filled with pseudo-random noise in R, G, B. */
function makeCarrier(): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(CARRIER_SIDE * CARRIER_SIDE * 4);
  let s = 0x1234abcd;
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

// Biased toward small sizes; occasional medium and near-maximum payloads.
const payloadArb = fc
  .record({
    size: fc.oneof(
      { arbitrary: fc.integer({ min: 1, max: 512 }), weight: 40 },
      { arbitrary: fc.integer({ min: 513, max: 16_384 }), weight: 6 },
      { arbitrary: fc.constantFrom(1, MAX_CIPHERTEXT_BYTES - 1, MAX_CIPHERTEXT_BYTES), weight: 2 },
      { arbitrary: fc.integer({ min: 16_385, max: MAX_CIPHERTEXT_BYTES }), weight: 1 },
    ),
    seed: fc.integer({ min: 1, max: 0x7fffffff }),
  })
  .map(({ size, seed }) => bytesFromSeed(size, seed));

const spatialKeyArb = fc.record({
  rot: fc.tuple(
    fc.double({ min: 0, max: 360, maxExcluded: true, noNaN: true }),
    fc.double({ min: 0, max: 360, maxExcluded: true, noNaN: true }),
    fc.double({ min: 0, max: 360, maxExcluded: true, noNaN: true }),
  ),
  ring: fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 8, maxLength: 8 }),
  crystal: fc.boolean(),
});

// 8..64 UTF-16 code units, matching the KeyDeriver length check.
const passphraseArb = fc.string({ minLength: 8, maxLength: 64, unit: 'grapheme-ascii' });

let carrier: Uint8ClampedArray;
let pool: Combo[];

beforeAll(async () => {
  carrier = makeCarrier();
  const serializer = new SpatialKeySerializer(() => {});
  const keys = fc.sample(spatialKeyArb, { numRuns: POOL_SIZE, seed: 20260101 });
  const passphrases = fc.sample(passphraseArb, { numRuns: POOL_SIZE, seed: 20260102 });
  pool = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const k = keys[i];
    const key = await serializer.serialize(k.rot, k.ring, k.crystal);
    pool.push({ passphrase: passphrases[i], key });
  }
});

async function encrypt(
  payload: Uint8Array,
  combo: Combo,
): Promise<EncryptResponsePayload> {
  const reply = await handleCryptoMessage({
    kind: 'request',
    id: 'rt-enc',
    target: 'crypto',
    op: 'encrypt',
    payload: { payload, passphrase: combo.passphrase, spatialKeySnapshot: combo.key },
  });
  if (reply.kind !== 'response') throw new Error(`encrypt failed: ${JSON.stringify(reply)}`);
  return reply.payload as EncryptResponsePayload;
}

async function decrypt(
  parts: ReturnType<typeof unpackPayload>,
  combo: Combo,
): Promise<Uint8Array> {
  const reply = await handleCryptoMessage({
    kind: 'request',
    id: 'rt-dec',
    target: 'crypto',
    op: 'decrypt',
    payload: {
      ciphertext: parts.ciphertext,
      iv: parts.iv,
      salt: parts.salt,
      tag: parts.tag,
      passphrase: combo.passphrase,
      spatialKeySnapshot: combo.key,
    },
  });
  if (reply.kind !== 'response') throw new Error(`decrypt failed: ${JSON.stringify(reply)}`);
  return (reply.payload as DecryptResponsePayload).plaintext;
}

describe('Property 1: round-trip fidelity (encrypt -> embed -> extract -> decrypt)', () => {
  it(
    'recovers the original payload byte-for-byte',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          payloadArb,
          fc.integer({ min: 0, max: POOL_SIZE - 1 }),
          async (payload, comboIndex) => {
            const combo = pool[comboIndex];

            const enc = await encrypt(payload, combo);
            const packed = packPayload(enc);
            const stego = embed(carrier, packed);

            // Carrier stays a 1024x1024 opaque RGBA buffer; only R/G/B LSBs may change.
            expect(stego.length).toBe(carrier.length);

            const extracted = extract(stego);
            const parts = unpackPayload(extracted);
            const recovered = await decrypt(parts, combo);

            expect(recovered.byteLength).toBe(payload.byteLength);
            expect(Buffer.from(recovered).equals(Buffer.from(payload))).toBe(true);
          },
        ),
        { numRuns: NUM_RUNS, endOnFailure: true },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
