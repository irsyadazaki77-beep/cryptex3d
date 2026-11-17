/**
 * Decryptor: AES-256-GCM. Tag mismatch is surfaced as AuthFailError.
 * Never logs plaintext or key material, and no partial plaintext is returned.
 */
import { GCM_TAG_BITS, joinTag } from './GcmTag';

export class AuthFailError extends Error {
  readonly code = 'AUTH_FAIL';
  constructor() {
    super('Authentication failed');
    this.name = 'AuthFailError';
  }
}

/** `ciphertext` is in WebCrypto layout (encrypted bytes || 16-byte tag). */
export async function decrypt(
  key: CryptoKey,
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  try {
    const out = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv), tagLength: GCM_TAG_BITS },
      key,
      new Uint8Array(ciphertext),
    );
    return new Uint8Array(out);
  } catch (e) {
    if (e instanceof DOMException) throw new AuthFailError();
    throw e;
  }
}

/** Rejoins the detached 16-byte tag, then decrypts. */
export function decryptDetached(
  key: CryptoKey,
  iv: Uint8Array,
  ciphertext: Uint8Array,
  tag: Uint8Array,
): Promise<Uint8Array> {
  return decrypt(key, iv, joinTag(ciphertext, tag));
}
