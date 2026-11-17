import { describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  MAGIC,
  HEADER_SIZE,
  CHECKSUM_SIZE,
  buildBitstream,
  parseBitstream,
  BadMagicError,
  ChecksumFailError,
} from '../../src/core/stego/BitstreamLayout';
import { sha256 } from '../../src/core/stego/sha256';

const payload = (n: number) => new Uint8Array(n).map((_, i) => (i * 7 + 3) & 255);
const nodeSha = async (b: Uint8Array) =>
  new Uint8Array(await webcrypto.subtle.digest('SHA-256', b as Uint8Array<ArrayBuffer>));

// Validates: Requirements 15.1
describe('BitstreamLayout', () => {
  it('uses the exact magic header bytes', () => {
    expect(Array.from(MAGIC)).toEqual([0x43, 0x52, 0x59, 0x50, 0x54, 0x33, 0x44, 0x00]);
    expect(Array.from(buildBitstream(payload(5)).subarray(0, 8))).toEqual(Array.from(MAGIC));
  });

  it('encodes payload length as big-endian uint32', () => {
    const bs = buildBitstream(payload(0x0102));
    expect(Array.from(bs.subarray(8, 12))).toEqual([0, 0, 0x01, 0x02]);
    expect(bs.byteLength).toBe(HEADER_SIZE + 0x0102 + CHECKSUM_SIZE);
  });

  it('checksum covers header + length + ciphertext and matches node SHA-256', async () => {
    for (const n of [0, 1, 55, 64, 1000]) {
      const p = payload(n);
      const bs = buildBitstream(p);
      const end = HEADER_SIZE + n;
      expect(Array.from(bs.subarray(end))).toEqual(Array.from(await nodeSha(bs.subarray(0, end))));
      expect(Array.from(sha256(bs.subarray(0, end)))).toEqual(Array.from(bs.subarray(end)));
      expect(Array.from(bs.subarray(HEADER_SIZE, end))).toEqual(Array.from(p));
    }
  });

  it('round-trips through parseBitstream', () => {
    const p = payload(300);
    expect(Array.from(parseBitstream(buildBitstream(p)))).toEqual(Array.from(p));
  });

  it('throws BadMagicError on wrong or truncated magic', () => {
    const bs = buildBitstream(payload(10));
    bs[0] ^= 0xff;
    expect(() => parseBitstream(bs)).toThrow(BadMagicError);
    expect(() => parseBitstream(new Uint8Array(5))).toThrow(BadMagicError);
  });

  it('throws ChecksumFailError on tampered ciphertext, length, checksum, or truncation', () => {
    const base = buildBitstream(payload(40));

    const c = base.slice();
    c[HEADER_SIZE + 3] ^= 1;
    expect(() => parseBitstream(c)).toThrow(ChecksumFailError);

    const l = base.slice();
    l[11] ^= 1;
    expect(() => parseBitstream(l)).toThrow(ChecksumFailError);

    const k = base.slice();
    k[k.length - 1] ^= 1;
    expect(() => parseBitstream(k)).toThrow(ChecksumFailError);

    expect(() => parseBitstream(base.subarray(0, base.length - 1))).toThrow(ChecksumFailError);
  });
});
