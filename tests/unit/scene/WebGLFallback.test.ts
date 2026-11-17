import { describe, expect, it } from 'vitest';
import { INVALID_SPATIAL_KEY_MESSAGE, validateSpatialKeyHex } from '../../../src/scene/WebGLFallback';

describe('validateSpatialKeyHex', () => {
  it('accepts 64 hex chars in any case', () => {
    expect(validateSpatialKeyHex('a'.repeat(64))).toBeNull();
    expect(validateSpatialKeyHex('0123456789ABCDEFabcdef'.padEnd(64, '0'))).toBeNull();
  });

  it.each([
    ['empty', ''],
    ['63 chars', 'a'.repeat(63)],
    ['65 chars', 'a'.repeat(65)],
    ['non-hex', 'g'.repeat(64)],
    ['whitespace padded', ` ${'a'.repeat(64)}`],
    ['trailing newline', `${'a'.repeat(64)}\n`],
  ])('rejects %s', (_n, input) => {
    expect(validateSpatialKeyHex(input)).toBe(INVALID_SPATIAL_KEY_MESSAGE);
  });
});

