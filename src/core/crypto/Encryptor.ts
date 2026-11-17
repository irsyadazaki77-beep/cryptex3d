/**
 * Encryptor: AES-256-GCM with a fresh random 12-byte IV and 128-bit tag.
 * Never logs payloads or key material.
 */
import { GCM_IV_BYTES, GCM_TAG_BITS, splitTag } from './GcmTag';

export interface EncryptResult {
  iv: Uint8Array;
  /** WebCrypto layout: encrypted bytes followed by the 16-byte tag. */
  ciphertext: Uint8Array;
}

export interface DetachedEncryptResult {
  iv: Uint8Array;
  /** Encrypted bytes only (same length as the payload). */
  ciphertext: Uint8Array;
  /** 16-byte authentication tag. */
  tag: Uint8Array;
}

export async function encrypt(key: CryptoKey, payload: Uint8Array): Promise<EncryptResult> {
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES));
  const out = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: GCM_TAG_BITS },
    key,
    new Uint8Array(payload),
  );
  return { iv, ciphertext: new Uint8Array(out) };
}

/** Same as `encrypt`, but with the trailing 16-byte tag split into `tag`. */
export async function encryptDetached(
  key: CryptoKey,
  payload: Uint8Array,
): Promise<DetachedEncryptResult> {
  const { iv, ciphertext: combined } = await encrypt(key, payload);
  return { iv, ...splitTag(combined) };
}
