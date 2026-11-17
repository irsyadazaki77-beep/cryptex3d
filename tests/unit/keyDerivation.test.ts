import { describe, it, expect } from 'vitest';
import {
  deriveKey,
  deriveKeyWithSalt,
  InvalidPassphraseError,
  PASSPHRASE_MIN_LENGTH,
  PASSPHRASE_MAX_LENGTH,
  SALT_LENGTH,
} from '../../src/core/crypto/KeyDeriver';

// Requirement 15.1
const PASS = 'correct horse battery';
const SPATIAL = 'a1b2c3d4e5f60718';
const IV = new Uint8Array(12).fill(7);
const PLAIN = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

async function encryptWith(key: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: IV }, key, PLAIN));
}

describe('KeyDeriver determinism', () => {
  it('identical inputs yield identical salt and identical 256-bit key material', async () => {
    const a = await deriveKey(PASS, SPATIAL);
    const b = await deriveKey(PASS, SPATIAL);
    expect(a.salt.byteLength).toBe(SALT_LENGTH);
    expect(a.salt).toEqual(b.salt);
    expect((a.key.algorithm as AesKeyAlgorithm).length).toBe(256);
    expect(a.key.extractable).toBe(false);
    // Same key material => identical ciphertext under a fixed IV, and cross-decrypt works.
    const ctA = await encryptWith(a.key);
    const ctB = await encryptWith(b.key);
    expect(ctA).toEqual(ctB);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: IV }, b.key, ctA);
    expect(new Uint8Array(pt)).toEqual(PLAIN);
  });

  it('deriveKeyWithSalt with the stored salt reproduces the same key', async () => {
    const a = await deriveKey(PASS, SPATIAL);
    const k = await deriveKeyWithSalt(PASS, a.salt);
    expect(await encryptWith(k)).toEqual(await encryptWith(a.key));
  });

  it('a different spatialKeyHash changes the salt and the key', async () => {
    const a = await deriveKey(PASS, SPATIAL);
    const b = await deriveKey(PASS, SPATIAL + 'x');
    expect(b.salt).not.toEqual(a.salt);
    expect(await encryptWith(b.key)).not.toEqual(await encryptWith(a.key));
  });

  it('any single-character passphrase change produces a different salt', async () => {
    const base = await deriveKey(PASS, SPATIAL);
    const variants = [
      'Correct horse battery', // first char
      'correct horse batterz', // last char
      'correct h0rse battery', // middle char
    ];
    for (const v of variants) {
      const d = await deriveKey(v, SPATIAL);
      expect(d.salt).not.toEqual(base.salt);
    }
  });
});

describe('KeyDeriver passphrase validation', () => {
  it('rejects passphrases shorter than the minimum', async () => {
    await expect(deriveKey('a'.repeat(PASSPHRASE_MIN_LENGTH - 1), SPATIAL)).rejects.toBeInstanceOf(
      InvalidPassphraseError,
    );
    await expect(deriveKey('', SPATIAL)).rejects.toBeInstanceOf(InvalidPassphraseError);
  });

  it('rejects passphrases longer than the maximum', async () => {
    await expect(deriveKey('a'.repeat(PASSPHRASE_MAX_LENGTH + 1), SPATIAL)).rejects.toBeInstanceOf(
      InvalidPassphraseError,
    );
  });

  it('rejects invalid passphrase in deriveKeyWithSalt', async () => {
    await expect(deriveKeyWithSalt('short', new Uint8Array(SALT_LENGTH))).rejects.toBeInstanceOf(
      InvalidPassphraseError,
    );
  });

  it('accepts boundary lengths', async () => {
    await expect(deriveKey('a'.repeat(PASSPHRASE_MIN_LENGTH), SPATIAL)).resolves.toBeDefined();
    await expect(deriveKey('a'.repeat(PASSPHRASE_MAX_LENGTH), SPATIAL)).resolves.toBeDefined();
  });
});
