/**
 * KeyDeriver: PBKDF2-HMAC-SHA-256 -> AES-GCM 256-bit key.
 * Web Crypto only. Never logs passphrase, salt input, or key material.
 */

export const PASSPHRASE_MIN_LENGTH = 8;
export const PASSPHRASE_MAX_LENGTH = 64;
export const PBKDF2_ITERATIONS = 310_000;
export const SALT_LENGTH = 16;

export class InvalidPassphraseError extends Error {
  readonly code = 'INVALID_PASSPHRASE';
  constructor() {
    super(
      `Passphrase must be between ${PASSPHRASE_MIN_LENGTH} and ${PASSPHRASE_MAX_LENGTH} characters`,
    );
    this.name = 'InvalidPassphraseError';
  }
}

function validatePassphrase(passphrase: string): void {
  if (
    typeof passphrase !== 'string' ||
    passphrase.length < PASSPHRASE_MIN_LENGTH ||
    passphrase.length > PASSPHRASE_MAX_LENGTH
  ) {
    throw new InvalidPassphraseError();
  }
}

/** salt = SHA-256(passphrase + spatialKeyHash)[0..15] */
async function computeSalt(passphrase: string, spatialKeyHash: string): Promise<Uint8Array> {
  const input = new TextEncoder().encode(passphrase + spatialKeyHash);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return new Uint8Array(digest).slice(0, SALT_LENGTH);
}

/**
 * Derive a non-extractable AES-256-GCM key using a caller-supplied salt
 * (used by decrypt, which reuses the stored salt).
 */
export async function deriveKeyWithSalt(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  validatePassphrase(passphrase);
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new Uint8Array(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Derive a key and the salt binding the passphrase to the spatial key hash. */
export async function deriveKey(
  passphrase: string,
  spatialKeyHash: string,
): Promise<{ key: CryptoKey; salt: Uint8Array }> {
  validatePassphrase(passphrase);
  const salt = await computeSalt(passphrase, spatialKeyHash);
  const key = await deriveKeyWithSalt(passphrase, salt);
  return { key, salt };
}
