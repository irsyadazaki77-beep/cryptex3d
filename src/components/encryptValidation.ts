/** Pure validation helpers for EncryptPanel. No React imports. */
export const MAX_FILE_BYTES = 256_000;
export const MIN_PASSPHRASE_LENGTH = 8;
export const MAX_PASSPHRASE_LENGTH = 64;

export const FILE_TOO_LARGE_MESSAGE = 'File too large — maximum is 250 KB';
export const PASSPHRASE_LENGTH_MESSAGE = `Passphrase must be ${MIN_PASSPHRASE_LENGTH}–${MAX_PASSPHRASE_LENGTH} characters`;
export const EMPTY_FILE_MESSAGE = 'File is empty';

/** Returns an error message, or null when the file size is acceptable. */
export function validateFileSize(byteLength: number): string | null {
  if (byteLength <= 0) return EMPTY_FILE_MESSAGE;
  if (byteLength > MAX_FILE_BYTES) return FILE_TOO_LARGE_MESSAGE;
  return null;
}

/** Returns an error message, or null when the passphrase length is 8-64 characters. */
export function validatePassphrase(passphrase: string): string | null {
  const len = passphrase.length;
  if (len < MIN_PASSPHRASE_LENGTH || len > MAX_PASSPHRASE_LENGTH) return PASSPHRASE_LENGTH_MESSAGE;
  return null;
}

/** Horcrux Mode keeps the WAV shard to roughly 12 s of audio. Mirrors HORCRUX_MAX_SECRET_BYTES in the crypto layer. */
export const MAX_HORCRUX_FILE_BYTES = 65_536;
export const HORCRUX_TOO_LARGE_MESSAGE = 'Horcrux Mode supports files up to 64 KB';

/** Returns an error message, or null when the file fits Horcrux Mode. */
export function validateHorcruxSize(byteLength: number): string | null {
  return byteLength > MAX_HORCRUX_FILE_BYTES ? HORCRUX_TOO_LARGE_MESSAGE : null;
}
