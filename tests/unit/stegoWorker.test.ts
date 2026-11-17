import { describe, expect, it } from 'vitest';
import { packPayload, unpackPayload, PackFormatError, MAX_CIPHERTEXT_BYTES } from '../../src/core/stego/payloadPacking';
import { embed } from '../../src/core/stego/LSBEmbedder';
import { extract } from '../../src/core/stego/LSBExtractor';
import { handleStegoMessage } from '../../src/core/stego/StegoWorker';

const parts = (n: number) => ({
  iv: new Uint8Array(12).fill(1),
  salt: new Uint8Array(16).fill(2),
  ciphertext: new Uint8Array(n).map((_, i) => i & 255),
  tag: new Uint8Array(16).fill(3),
});

describe('payloadPacking', () => {
  it('round-trips pack/unpack', () => {
    const p = parts(100);
    expect(unpackPayload(packPayload(p))).toEqual(p);
  });
  it('rejects wrong sizes and short blobs', () => {
    expect(() => packPayload({ ...parts(1), iv: new Uint8Array(5) })).toThrow(PackFormatError);
    expect(() => unpackPayload(new Uint8Array(10))).toThrow(PackFormatError);
  });
  it('round-trips through LSB embed/extract on raw pixels', () => {
    const carrier = new Uint8ClampedArray(1024 * 1024 * 4).fill(255);
    const p = parts(MAX_CIPHERTEXT_BYTES);
    expect(unpackPayload(extract(embed(carrier, packPayload(p))))).toEqual(p);
  });
});

describe('handleStegoMessage', () => {
  it('returns INVALID_INPUT for unknown op', async () => {
    const r = await handleStegoMessage({ kind: 'request', id: '1', target: 'stego', op: 'nope', payload: {} });
    expect(r).toMatchObject({ kind: 'error', code: 'INVALID_INPUT' });
  });
  it('returns PAYLOAD size errors as INVALID_INPUT for bad iv size', async () => {
    const r = await handleStegoMessage({
      kind: 'request', id: '2', target: 'stego', op: 'embed',
      payload: { carrierPNG: new Uint8Array(1), ciphertext: new Uint8Array(1), iv: new Uint8Array(1), salt: new Uint8Array(16), tag: new Uint8Array(16) },
    });
    expect(r).toMatchObject({ kind: 'error', code: 'INVALID_INPUT' });
  });
});
