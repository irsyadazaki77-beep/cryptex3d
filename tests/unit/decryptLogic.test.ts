import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  AUTH_FAIL_MESSAGE,
  CHECKSUM_FAIL_MESSAGE,
  GENERIC_ERROR_MESSAGE,
  MAX_RETRIES,
  RETRY_LIMIT_MESSAGE,
  displayMessage,
  isRetryLimitReached,
  isValidPassphrase,
  messageForError,
  nextAttempts,
} from '../../src/components/decryptLogic';

describe('decryptLogic', () => {
  it('validates passphrase length 8-64', () => {
    expect(isValidPassphrase('a'.repeat(7))).toBe(false);
    expect(isValidPassphrase('a'.repeat(8))).toBe(true);
    expect(isValidPassphrase('a'.repeat(64))).toBe(true);
    expect(isValidPassphrase('a'.repeat(65))).toBe(false);
  });

  it('maps error codes to messages', () => {
    expect(messageForError('AUTH_FAIL')).toBe(AUTH_FAIL_MESSAGE);
    expect(messageForError('CHECKSUM_FAIL')).toBe(CHECKSUM_FAIL_MESSAGE);
    expect(messageForError('secret-passphrase')).toBe(GENERIC_ERROR_MESSAGE);
    expect(messageForError(null)).toBeNull();
  });

  it('locks after 10 consecutive AUTH_FAILs', () => {
    let a = 0;
    for (let i = 0; i < MAX_RETRIES - 1; i++) a = nextAttempts(a, 'AUTH_FAIL');
    expect(isRetryLimitReached(a)).toBe(false);
    expect(displayMessage(a, 'AUTH_FAIL')).toBe(AUTH_FAIL_MESSAGE);
    a = nextAttempts(a, 'AUTH_FAIL');
    expect(isRetryLimitReached(a)).toBe(true);
    expect(displayMessage(a, 'AUTH_FAIL')).toBe(RETRY_LIMIT_MESSAGE);
  });

  it('resets the counter on non-AUTH_FAIL outcomes', () => {
    expect(nextAttempts(5, null)).toBe(0);
    expect(nextAttempts(5, 'CHECKSUM_FAIL')).toBe(0);
  });

  it('attempt count never exceeds the limit', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom('AUTH_FAIL', 'CHECKSUM_FAIL', null)), (codes) => {
        let a = 0;
        for (const c of codes) a = nextAttempts(a, c);
        return a >= 0 && a <= MAX_RETRIES;
      }),
    );
  });
});
