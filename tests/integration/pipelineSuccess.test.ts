/**
 * Integration: full pipeline success path with a matching spatial key.
 *
 * Drives the real pure worker handlers (handleCryptoMessage, packPayload,
 * LSBEmbedder, LSBExtractor, unpackPayload) over a raw 1024x1024 RGBA buffer.
 * PNG decode/encode is skipped because it needs browser APIs; PNG is lossless,
 * so the pixel buffer is what the real pipeline carries.
 *
 * **Validates: Requirements 15.1**
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { handleCryptoMessage } from '../../src/core/crypto/CryptoWorker';
import type {
  DecryptResponsePayload,
  EncryptResponsePayload,
} from '../../src/core/crypto/CryptoWorker';
import { embed } from '../../src/core/stego/LSBEmbedder';
import { extract } from '../../src/core/stego/LSBExtractor';
import { packPayload, unpackPayload } from '../../src/core/stego/payloadPacking';
import { SpatialKeySerializer } from '../../src/scene/SpatialKeySerializer';
import type { SpatialKeySnapshot } from '../../src/store/types';

const SIDE = 1024;
const PASSPHRASE = 'correct horse battery';

function makeCarrier(): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(SIDE * SIDE * 4);
  let s = 0x1234abcd;
  for (let i = 0; i < buf.length; i += 4) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    buf[i] = s & 0xff;
    buf[i + 1] = (s >>> 8) & 0xff;
    buf[i + 2] = (s >>> 16) & 0xff;
    buf[i + 3] = 255;
  }
  return buf;
}

function makePayload(size: number): Uint8Array {
  const out = new Uint8Array(size);
  let s = 0x9e3779b9;
  for (let i = 0; i < size; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    out[i] = s & 0xff;
  }
  return out;
}

let carrier: Uint8ClampedArray;
let key: SpatialKeySnapshot;

beforeAll(async () => {
  carrier = makeCarrier();
  key = await new SpatialKeySerializer(() => {}).serialize(
    [12.5, 200.25, 359.5],
    [0, 3, 9, 1, 4, 7, 2, 5],
    true,
  );
});

async function runPipeline(payload: Uint8Array): Promise<Uint8Array> {
  const encReply = await handleCryptoMessage({
    kind: 'request',
    id: 'enc',
    target: 'crypto',
    op: 'encrypt',
    payload: { payload, passphrase: PASSPHRASE, spatialKeySnapshot: key },
  });
  if (encReply.kind !== 'response') throw new Error('encrypt failed');
  const enc = encReply.payload as EncryptResponsePayload;

  const stego = embed(carrier, packPayload(enc));
  const parts = unpackPayload(extract(stego));

  const decReply = await handleCryptoMessage({
    kind: 'request',
    id: 'dec',
    target: 'crypto',
    op: 'decrypt',
    payload: {
      ciphertext: parts.ciphertext,
      iv: parts.iv,
      salt: parts.salt,
      tag: parts.tag,
      passphrase: PASSPHRASE,
      spatialKeySnapshot: key,
    },
  });
  if (decReply.kind !== 'response') throw new Error('decrypt failed');
  return (decReply.payload as DecryptResponsePayload).plaintext;
}

describe('pipeline success path (matching spatial key)', () => {
  it.each([1, 100, 1024, 100_000])(
    'recovers a %i-byte payload byte-for-byte',
    async (size) => {
      const payload = makePayload(size);
      const recovered = await runPipeline(payload);
      expect(recovered.byteLength).toBe(payload.byteLength);
      expect(Buffer.from(recovered).equals(Buffer.from(payload))).toBe(true);
    },
    60_000,
  );
});
