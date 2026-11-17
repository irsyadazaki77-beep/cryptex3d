import { describe, it, expect } from 'vitest';
import { embed, PayloadTooLargeError } from '../../src/core/stego/LSBEmbedder';
import { extract, BadMagicError, ChecksumFailError } from '../../src/core/stego/LSBExtractor';

// Validates: Requirements 15.1

const SIZE = 64;

/** Opaque RGBA carrier with deterministic, varied pixel values. */
function makeCarrier(): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) {
    buf[i * 4] = (i * 7 + 13) & 0xff;
    buf[i * 4 + 1] = (i * 11 + 91) & 0xff;
    buf[i * 4 + 2] = (i * 5 + 201) & 0xff;
    buf[i * 4 + 3] = 255;
  }
  return buf;
}

function makePayload(n: number): Uint8Array {
  const p = new Uint8Array(n);
  for (let i = 0; i < n; i++) p[i] = (i * 37 + 5) & 0xff;
  return p;
}

describe('LSB embed/extract', () => {
  it('round-trips a 100-byte payload byte-for-byte', () => {
    const payload = makePayload(100);
    const out = extract(embed(makeCarrier(), payload));
    expect(Array.from(out)).toEqual(Array.from(payload));
  });

  it('throws BadMagicError on a carrier without payload', () => {
    const carrier = new Uint8ClampedArray(SIZE * SIZE * 4); // all zeros, no magic
    for (let i = 3; i < carrier.length; i += 4) carrier[i] = 255;
    expect(() => extract(carrier)).toThrow(BadMagicError);
  });

  it('throws ChecksumFailError after flipping an LSB in the payload region', () => {
    const embedded = embed(makeCarrier(), makePayload(100));
    // Header = 8 magic + 4 length bytes = 96 bits. Flip a consumed slot inside the ciphertext.
    const slot = 96 + 10;
    const byteIndex = Math.floor(slot / 3) * 4 + (slot % 3);
    embedded[byteIndex] ^= 1;
    expect(() => extract(embedded)).toThrow(ChecksumFailError);
  });

  it('throws PayloadTooLargeError for >256000 bytes and leaves the carrier unchanged', () => {
    const carrier = makeCarrier();
    const snapshot = new Uint8ClampedArray(carrier);
    expect(() => embed(carrier, new Uint8Array(256001))).toThrow(PayloadTooLargeError);
    expect(Array.from(carrier)).toEqual(Array.from(snapshot));
  });

  it('leaves alpha and non-LSB bits untouched', () => {
    const carrier = makeCarrier();
    const out = embed(carrier, makePayload(100));
    expect(out.length).toBe(carrier.length);
    for (let i = 0; i < carrier.length; i++) {
      if (i % 4 === 3) expect(out[i]).toBe(carrier[i]);
      else expect(out[i] & 0xfe).toBe(carrier[i] & 0xfe);
    }
    // Input buffer is not mutated.
    expect(carrier[3]).toBe(255);
  });
});
