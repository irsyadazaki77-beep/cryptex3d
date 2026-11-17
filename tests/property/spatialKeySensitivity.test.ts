/**
 * Property 3: Spatial Key Sensitivity
 * Changing a single spatial key field changes the PBKDF2 salt, where
 * salt = SHA-256(passphrase + serializedHash)[0..15]. The salt is taken from
 * KeyDeriver.deriveKey's return value (each run performs two real PBKDF2
 * derivations at 310 000 iterations, hence the long timeout).
 *
 * **Validates: Requirements 2.3, 15.7**
 */
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { deriveKey } from '../../src/core/crypto/KeyDeriver';
import {
  bytesEqual,
  keyPairOneFieldArb,
  LONG_TIMEOUT_MS,
  NUM_RUNS,
  passphraseArb,
  snapshotOf,
} from './helpers';

describe('Property 3: spatial key sensitivity', () => {
  it('a one-field change yields a different derived salt', async () => {
    await fc.assert(
      fc.asyncProperty(passphraseArb, keyPairOneFieldArb, async (passphrase, { a, b }) => {
        const sa = await snapshotOf(a);
        const sb = await snapshotOf(b);
        const da = await deriveKey(passphrase, sa.serializedHash);
        const db = await deriveKey(passphrase, sb.serializedHash);
        expect(da.salt.byteLength).toBe(16);
        expect(db.salt.byteLength).toBe(16);
        expect(bytesEqual(da.salt, db.salt)).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  }, LONG_TIMEOUT_MS);
});
