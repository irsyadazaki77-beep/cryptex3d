/** Pure decrypt-panel logic: passphrase validation, retry counting, error mapping. */

export const MAX_RETRIES = 10;
export const PASSPHRASE_MIN = 8;
export const PASSPHRASE_MAX = 64;

export const AUTH_FAIL_MESSAGE =
  "Decryption failed — verify artifact positions match the sender's configuration.";
export const RETRY_LIMIT_MESSAGE =
  'Retry limit reached — please re-initiate from the Decrypt panel';
export const CHECKSUM_FAIL_MESSAGE =
  'Carrier integrity check failed — the PNG may have been re-encoded in transit. Request a fresh lossless copy.';
export const BAD_MAGIC_MESSAGE = 'No Cryptex3D payload was found in this carrier.';
export const GENERIC_ERROR_MESSAGE = 'Decryption could not be completed.';

export function isValidPassphrase(passphrase: string): boolean {
  return passphrase.length >= PASSPHRASE_MIN && passphrase.length <= PASSPHRASE_MAX;
}

export type DecryptErrorKind = 'AUTH_FAIL' | 'CHECKSUM_FAIL' | 'BAD_MAGIC' | 'OTHER';

export function classifyError(code: string | null): DecryptErrorKind | null {
  if (code === null) return null;
  if (code === 'AUTH_FAIL') return 'AUTH_FAIL';
  if (code === 'CHECKSUM_FAIL') return 'CHECKSUM_FAIL';
  if (code === 'BAD_MAGIC') return 'BAD_MAGIC';
  return 'OTHER';
}

/** Maps a stored error code to a user-facing message. Unknown values are never echoed. */
export function messageForError(code: string | null): string | null {
  switch (classifyError(code)) {
    case null:
      return null;
    case 'AUTH_FAIL':
      return AUTH_FAIL_MESSAGE;
    case 'CHECKSUM_FAIL':
      return CHECKSUM_FAIL_MESSAGE;
    case 'BAD_MAGIC':
      return BAD_MAGIC_MESSAGE;
    default:
      return GENERIC_ERROR_MESSAGE;
  }
}

/** Consecutive AUTH_FAIL attempts on the current carrier. */
export function nextAttempts(attempts: number, code: string | null): number {
  return classifyError(code) === 'AUTH_FAIL' ? Math.min(attempts + 1, MAX_RETRIES) : 0;
}

export function isRetryLimitReached(attempts: number): boolean {
  return attempts >= MAX_RETRIES;
}

/** Message to display given the attempt count and latest error code. */
export function displayMessage(attempts: number, code: string | null): string | null {
  if (isRetryLimitReached(attempts)) return RETRY_LIMIT_MESSAGE;
  return messageForError(code);
}
