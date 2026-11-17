import { describe, it, expect } from 'vitest';
import { encrypt, encryptDetached } from '../../src/core/crypto/Encryptor';
import { decrypt, decryptDetached, AuthFailError } from '../../src/core/crypto/Decryptor';

async function newKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

describe('Encryptor / Decryptor', () => {
  it('round-trips and uses a 12-byte IV, fresh per call', async () => {
    const key = await newKey();
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const a = await encrypt(key, payload);
    const b = await encrypt(key, payload);
    expect(a.iv.byteLength).toBe(12);
    expect(a.ciphertext.byteLength).toBe(payload.byteLength + 16);
    expect(a.iv).not.toEqual(b.iv);
    expect(await decrypt(key, a.iv, a.ciphertext)).toEqual(payload);
  });

  it('round-trips with a detached 16-byte tag', async () => {
    const key = await newKey();
    const payload = new Uint8Array(100).map((_, i) => i);
    const { iv, ciphertext, tag } = await encryptDetached(key, payload);
    expect(tag.byteLength).toBe(16);
    expect(ciphertext.byteLength).toBe(payload.byteLength);
    expect(await decryptDetached(key, iv, ciphertext, tag)).toEqual(payload);
  });

  it('throws AuthFailError on wrong key or tampered data', async () => {
    const key = await newKey();
    const other = await newKey();
    const { iv, ciphertext } = await encrypt(key, new Uint8Array([9, 9, 9]));
    await expect(decrypt(other, iv, ciphertext)).rejects.toBeInstanceOf(AuthFailError);
    const bad = ciphertext.slice();
    bad[0] ^= 1;
    await expect(decrypt(key, iv, bad)).rejects.toBeInstanceOf(AuthFailError);
  });
});
