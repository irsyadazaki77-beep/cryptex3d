/**
 * Packed blob layout embedded in the carrier (contains no plaintext):
 *
 *   offset  size  field
 *   0       12    iv         (AES-GCM nonce)
 *   12      16    salt       (PBKDF2 salt)
 *   28      N     ciphertext (N >= 0, without tag)
 *   28+N    16    tag        (AES-GCM authentication tag)
 *
 * Total = 44 + N bytes. The 256 000-byte limit enforced by LSBEmbedder
 * (MAX_PAYLOAD_BYTES) applies to this packed blob, so the maximum ciphertext
 * is 255 956 bytes.
 */
import { MAX_PAYLOAD_BYTES } from './BitstreamLayout';

export const IV_SIZE = 12;
export const SALT_SIZE = 16;
export const TAG_SIZE = 16;
export const PACK_OVERHEAD = IV_SIZE + SALT_SIZE + TAG_SIZE;
/** Largest ciphertext whose packed blob still fits MAX_PAYLOAD_BYTES. */
export const MAX_CIPHERTEXT_BYTES = MAX_PAYLOAD_BYTES - PACK_OVERHEAD;

export class PackFormatError extends Error {
  readonly code = 'INVALID_INPUT';
  constructor() {
    super('Invalid packed payload');
    this.name = 'PackFormatError';
  }
}

export interface PackedParts {
  iv: Uint8Array;
  salt: Uint8Array;
  ciphertext: Uint8Array;
  tag: Uint8Array;
}

/** @throws PackFormatError if iv/salt/tag sizes are wrong. Size limit is enforced by LSBEmbedder. */
export function packPayload(p: PackedParts): Uint8Array {
  if (p.iv.byteLength !== IV_SIZE || p.salt.byteLength !== SALT_SIZE || p.tag.byteLength !== TAG_SIZE) {
    throw new PackFormatError();
  }
  const out = new Uint8Array(PACK_OVERHEAD + p.ciphertext.byteLength);
  out.set(p.iv, 0);
  out.set(p.salt, IV_SIZE);
  out.set(p.ciphertext, IV_SIZE + SALT_SIZE);
  out.set(p.tag, IV_SIZE + SALT_SIZE + p.ciphertext.byteLength);
  return out;
}

/** @throws PackFormatError if the blob is shorter than the fixed overhead. */
export function unpackPayload(blob: Uint8Array): PackedParts {
  if (blob.byteLength < PACK_OVERHEAD) throw new PackFormatError();
  const ctEnd = blob.byteLength - TAG_SIZE;
  return {
    iv: blob.slice(0, IV_SIZE),
    salt: blob.slice(IV_SIZE, IV_SIZE + SALT_SIZE),
    ciphertext: blob.slice(IV_SIZE + SALT_SIZE, ctEnd),
    tag: blob.slice(ctEnd),
  };
}
