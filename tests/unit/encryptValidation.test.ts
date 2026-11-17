import { describe, expect, it } from 'vitest';
import {
  FILE_TOO_LARGE_MESSAGE,
  validateFileSize,
  validatePassphrase,
} from '../../src/components/encryptValidation';

describe('validateFileSize', () => {
  it('accepts 1 and 256000 bytes', () => {
    expect(validateFileSize(1)).toBeNull();
    expect(validateFileSize(256_000)).toBeNull();
  });
  it('rejects 256001 bytes with the required message', () => {
    expect(validateFileSize(256_001)).toBe(FILE_TOO_LARGE_MESSAGE);
    expect(FILE_TOO_LARGE_MESSAGE).toBe('File too large — maximum is 250 KB');
  });
  it('rejects empty files', () => {
    expect(validateFileSize(0)).not.toBeNull();
  });
});

describe('validatePassphrase', () => {
  it('accepts 8 and 64 characters', () => {
    expect(validatePassphrase('a'.repeat(8))).toBeNull();
    expect(validatePassphrase('a'.repeat(64))).toBeNull();
  });
  it('rejects 7 and 65 characters', () => {
    expect(validatePassphrase('a'.repeat(7))).not.toBeNull();
    expect(validatePassphrase('a'.repeat(65))).not.toBeNull();
  });
});
