import { describe, expect, it } from 'vitest';
import { GENERIC_ERROR_TEXT, sanitizeError } from '../../src/components/errorSanitizer';
import { AUTH_FAIL_MESSAGE } from '../../src/components/decryptLogic';

describe('sanitizeError', () => {
  it('maps known codes to fixed messages', () => {
    expect(sanitizeError('AUTH_FAIL')).toBe(AUTH_FAIL_MESSAGE);
    expect(sanitizeError('INVALID_PASSPHRASE')).toMatch(/8 and 64/);
    expect(sanitizeError('AUDIT_FAIL')).toBe('Audit could not be completed');
  });

  it('returns generic text for unknown strings, null and empty', () => {
    expect(sanitizeError('hunter2hunter2')).toBe(GENERIC_ERROR_TEXT);
    expect(sanitizeError(null)).toBe(GENERIC_ERROR_TEXT);
    expect(sanitizeError('')).toBe(GENERIC_ERROR_TEXT);
  });

  it('never echoes passphrases, hex/base64 runs or stack lines', () => {
    const hex = 'deadbeef'.repeat(8);
    const b64 = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=';
    const input = `Error: bad key ${hex} iv ${b64} passphrase=correcthorse\n    at decrypt (worker.js:1:2)\n    at run (worker.js:3:4)`;
    const out = sanitizeError(input);
    expect(out).toBe(GENERIC_ERROR_TEXT);
    for (const bad of [hex, b64, 'correcthorse', 'worker.js', 'at decrypt']) {
      expect(out).not.toContain(bad);
    }
  });

  it('still maps a known code when surrounded by a stack trace', () => {
    const out = sanitizeError('Error: AUTH_FAIL\n    at foo (a.js:1:1)');
    expect(out).toBe(AUTH_FAIL_MESSAGE);
    expect(out).not.toContain('a.js');
  });
});
