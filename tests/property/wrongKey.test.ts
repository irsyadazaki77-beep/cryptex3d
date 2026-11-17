/**
 * Property 2: Wrong-Key Rejection
 * Decrypting with a key derived from a different (passphrase, spatial key)
 * throws AuthFailError and returns no bytes.
 *
 * The pool holds keys derived via KeyDeriver.deriveKey from one base spatial
 * key: the base itself, one-field mutations of it (all 12 fields), and a
 * different passphrase. Any two distinct pool entries therefore differ in at
 * least one input, and each is derived once to bound PBKDF2 cost.
 *
 * **Validates: Requirements 3.7, 15.5**
 */
import { beforeAll, describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { deriveKey } from '../../src/core/crypto/KeyDeriver';
import { encrypt } from '../../src/core/crypto/Encryptor';
import { AuthFailError, decrypt } from '../../src/core/crypto/Decryptor';
import {
  FIELD_COUNT,
  keyFieldsArb,
  LONG_TIMEOUT_MS,
  mutateField,
  NUM_RUNS,
  payloadArb,
  snapshotOf,
} from './helpers';

const BASE_PASSPHRASE = 'correct horse battery';
const OTHER_PASSPHRASE = 'correct horse batterz';
let pool: CryptoKey[];

beforeAll(async () => {
  const [base] = fc.sample(keyFieldsArb, { numRuns: 1, seed: 7 });
  const variants = [{ k: base, p: BASE_PASSPHRASE }];
  for (let i = 0; i < FIELD_COUNT; i++) {
    variants.push({ k: mutateField(base, i, 1), p: BASE_PASSPHRASE });
  }
  variants.push({ k: base, p: OTHER_PASSPHRASE });
  pool = [];
  for (const v of variants) {
    const snap = await snapshotOf(v.k);
    pool.push((await deriveKey(v.p, snap.serializedHash)).key);
  }
}, LONG_TIMEOUT_MS);

describe('Property 2: wrong-key rejection', () => {
  it('decrypting with a different key throws AuthFailError and yields no bytes', async () => {
    await fc.assert(
      fc.asyncProperty(
        payloadArb(1, 4096),
        fc.integer({ min: 0, max: 13 }),
        fc.integer({ min: 1, max: 13 }),
        async (payload, i, offset) => {
          const j = (i + offset) % pool.length; // j !== i since offset in 1..13 and pool.length is 14
          const { iv, ciphertext } = await encrypt(pool[i], payload);
          let result: Uint8Array | undefined;
          let thrown: unknown;
          try {
            result = await decrypt(pool[j], iv, ciphertext);
          } catch (e) {
            thrown = e;
          }
          expect(thrown).toBeInstanceOf(AuthFailError);
          expect(result).toBeUndefined();
        },
      ),
      { numRuns: NUM_RUNS },
    );
  }, LONG_TIMEOUT_MS);
});
