/**
 * Pure error sanitizer for the HUD. Maps known worker error codes to fixed
 * user-readable messages. Anything unrecognised becomes a generic message, so
 * passphrases, key/IV bytes and stack traces can never be echoed (Req 12.1, 12.2).
 */
import {
  AUTH_FAIL_MESSAGE,
  BAD_MAGIC_MESSAGE,
  CHECKSUM_FAIL_MESSAGE,
} from './decryptLogic';

export const GENERIC_ERROR_TEXT = 'An error occurred. The operation could not be completed.';

const KNOWN_MESSAGES: Readonly<Record<string, string>> = {
  AUTH_FAIL: AUTH_FAIL_MESSAGE,
  INVALID_PASSPHRASE: 'Passphrase must be between 8 and 64 characters.',
  CHECKSUM_FAIL: CHECKSUM_FAIL_MESSAGE,
  MAGIC_FAIL: BAD_MAGIC_MESSAGE,
  BAD_MAGIC: BAD_MAGIC_MESSAGE,
  CARRIER_CAPACITY_EXCEEDED: 'The payload does not fit in the carrier image.',
  PAYLOAD_TOO_LARGE: 'File too large — maximum is 250 KB',
  INVALID_INPUT: 'The supplied input is invalid.',
  AUDIT_FAIL: 'Audit could not be completed',
  INTERNAL: GENERIC_ERROR_TEXT,
  // Fixed sentences the store emits itself.
  'Pipeline workers are not initialised.': 'Pipeline workers are not initialised.',
  'Set the artifact configuration before continuing.':
    'Set the artifact configuration before continuing.',
  'No carrier is available.': 'No carrier is available.',
  'Pipeline operation failed.': 'Pipeline operation failed.',
};

const CODE_PATTERN = /\b[A-Z]+(?:_[A-Z]+)+\b/g;
const LONG_HEX_RUN = /\b[0-9a-fA-F]{16,}\b/g;
const LONG_BASE64_RUN = /[A-Za-z0-9+/_-]{24,}={0,2}/g;

/** Removes stack-trace lines and long hex/base64-looking runs. */
export function scrub(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*at\s/.test(line))
    .join('\n')
    .replace(LONG_HEX_RUN, '')
    .replace(LONG_BASE64_RUN, '')
    .trim();
}

/** Returns user-readable text for a stored error code/message. Never echoes unknown input. */
export function sanitizeError(input: string | null | undefined): string {
  if (typeof input !== 'string') return GENERIC_ERROR_TEXT;
  const cleaned = scrub(input);
  if (cleaned.length === 0) return GENERIC_ERROR_TEXT;
  const exact = KNOWN_MESSAGES[cleaned];
  if (exact !== undefined) return exact;
  for (const token of cleaned.match(CODE_PATTERN) ?? []) {
    const hit = KNOWN_MESSAGES[token];
    if (hit !== undefined) return hit;
  }
  return GENERIC_ERROR_TEXT;
}
