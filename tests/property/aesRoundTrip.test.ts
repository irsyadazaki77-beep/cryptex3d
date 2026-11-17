/**
 * Property 1 (crypto layer): Round-Trip Fidelity
 * decrypt(encrypt(P, key), key) == P for keys produced by KeyDeriver.deriveKey.
 *
 * A pool of (passphrase, spatial key) combos is derived once in beforeAll to
 * bound PBKDF2 cost; every run still uses a fresh random IV and fresh payload.
 * Payload sizes are biased small with occasional large ones (up to 256 000).
 *
 * **Validates: Requirements 3.6, 15.3**
 */
import { beforeAll, describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { deriveKey } from '../../src/core/crypto/KeyDeriver';
import { encrypt } from '../../src/core/crypto/Encryptor';
import { decrypt } from '../../src/core/crypto/Decryptor';
import {
  bytesEqual,
  keyFieldsArb,
  LONG_TIMEOUT_MS,
  NUM_RUNS,
  passphraseArb,
  payloadArb,
  snapshotOf,
} from './helpers';

const POOL_SIZE = 6;
let pool: CryptoKey[];

beforeAll(async () => {
  const keys = fc.sample(keyFieldsArb, { numRuns: POOL_SIZE, seed: 41 });
  const phrases = fc.sample(passphraseArb, { numRuns: POOL_SIZE, seed: 42 });
  pool = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const snap = await snapshotOf(keys[i]);
    pool.push((await deriveKey(phrases[i], snap.serializedHash)).key);
  }
}, LONG_TIMEOUT_MS);

describe('Property 1 (crypto layer): AES-GCM round trip', () => {
  it('decrypt(encrypt(P)) returns P byte-for-byte', async () => {
    await fc.assert(
      fc.asyncProperty(
        payloadArb(1, 256_000),
        fc.integer({ min: 0, max: POOL_SIZE - 1 }),
        async (payload, idx) => {
          const { iv, ciphertext } = await encrypt(pool[idx], payload);
          expect(iv.byteLength).toBe(12);
          const plain = await decrypt(pool[idx], iv, ciphertext);
          expect(bytesEqual(plain, payload)).toBe(true);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  }, LONG_TIMEOUT_MS);
});
