/**
 * AES-GCM tag helpers.
 *
 * Design choice: WebCrypto's AES-GCM `encrypt` returns `ciphertext || tag`
 * (tag = trailing 16 bytes for the 128-bit tag we use). The design bundle
 * `{ iv, salt, ciphertext, tag }` wants the tag as a separate field, so
 * `splitTag` slices off those trailing 16 bytes and `joinTag` rebuilds the
 * WebCrypto layout before decrypt. Encryptor and Decryptor both use these
 * helpers so the layout stays consistent.
 */

export const GCM_TAG_BYTES = 16;
export const GCM_TAG_BITS = GCM_TAG_BYTES * 8;
export const GCM_IV_BYTES = 12;

/** Split WebCrypto output (`ciphertext || tag`) into its two parts. */
export function splitTag(combined: Uint8Array): { ciphertext: Uint8Array; tag: Uint8Array } {
  if (combined.byteLength < GCM_TAG_BYTES) {
    throw new RangeError('AES-GCM output shorter than the 16-byte tag');
  }
  const split = combined.byteLength - GCM_TAG_BYTES;
  return { ciphertext: combined.slice(0, split), tag: combined.slice(split) };
}

/** Rejoin a detached ciphertext and tag into the layout WebCrypto expects. */
export function joinTag(ciphertext: Uint8Array, tag: Uint8Array): Uint8Array {
  if (tag.byteLength !== GCM_TAG_BYTES) {
    throw new RangeError('AES-GCM tag must be exactly 16 bytes');
  }
  const out = new Uint8Array(ciphertext.byteLength + GCM_TAG_BYTES);
  out.set(ciphertext, 0);
  out.set(tag, ciphertext.byteLength);
  return out;
}
