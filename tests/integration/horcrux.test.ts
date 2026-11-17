/**
 * Integration: Horcrux Mode end to end through the real worker handlers.
 *
 * The three mediums are exercised with their real encoders:
 *   shard 1 -> PNG LSBs (raw pixel buffer; PNG itself is lossless and needs browser APIs)
 *   shard 2 -> WAV LSBs (synthesized drone)
 *   shard 3 -> encrypted JSON spatial token bound to the ring positions
 * PBKDF2 runs for real (310 000 iterations), so each sealed set costs a few hundred ms.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { handleCryptoMessage } from '../../src/core/crypto/CryptoWorker';
import { embed } from '../../src/core/stego/LSBEmbedder';
import { extract } from '../../src/core/stego/LSBExtractor';
import { embedInWav, extractFromWav, synthesizeCarrierFor } from '../../src/core/stego/audioStego';
import { HORCRUX_MAX_SECRET_BYTES } from '../../src/core/crypto/horcrux';
import { parseRecord } from '../../src/core/crypto/shamir';
import { toHex } from '../../src/core/crypto/base64';
import { SpatialKeySerializer } from '../../src/scene/SpatialKeySerializer';
import type { SpatialKeySnapshot, WorkerMessage } from '../../src/store/types';

const PASS = 'correct horse battery';
const SIDE = 1024;

const req = (op: string, payload: unknown): WorkerMessage => ({
  kind: 'request',
  id: op,
  target: 'crypto',
  op,
  payload,
});

function noiseCarrier(): Uint8ClampedArray {
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

interface Sealed {
  pngRecord: Uint8Array;
  wavRecord: Uint8Array;
  token: Uint8Array;
  setId: string;
}

let key: SpatialKeySnapshot;
let otherRing: SpatialKeySnapshot;
let otherKey: SpatialKeySnapshot;

beforeAll(async () => {
  const ser = new SpatialKeySerializer(() => {});
  key = await ser.serialize([10, 20, 30], [0, 1, 2, 3, 4, 5, 6, 7], true);
  otherRing = await ser.serialize([10, 20, 30], [9, 1, 2, 3, 4, 5, 6, 7], true);
  otherKey = await ser.serialize([11, 20, 30], [0, 1, 2, 3, 4, 5, 6, 7], true);
});

async function seal(secret: Uint8Array, expiresAt?: number): Promise<Sealed> {
  const r = await handleCryptoMessage(
    req('horcruxSeal', { payload: secret, passphrase: PASS, spatialKeySnapshot: key, expiresAt }),
  );
  expect(r.kind).toBe('response');
  return (r as { payload: Sealed }).payload;
}

/** Writes the sealed shards into their real carriers and reads them back, like a recipient would. */
function throughMediums(s: Sealed): { png: Uint8Array; wav: Uint8Array; token: Uint8Array } {
  const png = extract(embed(noiseCarrier(), s.pngRecord));
  const wav = extractFromWav(embedInWav(synthesizeCarrierFor(s.wavRecord.length), s.wavRecord));
  return { png, wav, token: s.token };
}

const open = (
  records: Uint8Array[],
  tokens: Uint8Array[],
  snapshot: SpatialKeySnapshot = key,
  passphrase = PASS,
  now?: number,
) =>
  handleCryptoMessage(
    req('horcruxOpen', { records, tokens, passphrase, spatialKeySnapshot: snapshot }),
    now === undefined ? {} : { now: () => now },
  );

const plaintextOf = (r: Awaited<ReturnType<typeof open>>): Uint8Array =>
  (r as { payload: { plaintext: Uint8Array } }).payload.plaintext;

describe('Horcrux Mode (2-of-3 across PNG, WAV and ring token)', () => {
  const secret = new TextEncoder().encode('the vault key is under the third floorboard');

  it('any two mediums recover the secret', async () => {
    const m = throughMediums(await seal(secret));
    expect(plaintextOf(await open([m.png, m.wav], []))).toEqual(secret);
    expect(plaintextOf(await open([m.png], [m.token]))).toEqual(secret);
    expect(plaintextOf(await open([m.wav], [m.token]))).toEqual(secret);
    expect(plaintextOf(await open([m.png, m.wav], [m.token]))).toEqual(secret);
  });

  it('one shard alone is refused and yields no plaintext', async () => {
    const m = throughMediums(await seal(secret));
    for (const r of [await open([m.png], []), await open([m.wav], []), await open([], [m.token])]) {
      expect(r).toMatchObject({ kind: 'error', code: 'INSUFFICIENT_SHARDS' });
      expect('payload' in r).toBe(false);
    }
  });

  it('a lone shard contains no part of the secret or the passphrase', async () => {
    const s = await seal(secret);
    const hay = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');
    for (const part of [s.pngRecord, s.wavRecord, s.token]) {
      expect(hay(part)).not.toContain('floorboard');
      expect(hay(part)).not.toContain(PASS);
    }
  });

  it('the three shards share one set id and use distinct points', async () => {
    const s = await seal(secret);
    const a = parseRecord(s.pngRecord);
    const b = parseRecord(s.wavRecord);
    expect([a.share.x, b.share.x]).toEqual([1, 2]);
    expect(toHex(a.setId)).toBe(s.setId);
    expect(toHex(b.setId)).toBe(s.setId);
  });

  it('wrong passphrase fails authentication even with two valid raw shards', async () => {
    const m = throughMediums(await seal(secret));
    expect(await open([m.png, m.wav], [], key, 'a different passphrase')).toMatchObject({
      kind: 'error',
      code: 'AUTH_FAIL',
    });
  });

  it('wrong Spatial Key fails authentication', async () => {
    const m = throughMediums(await seal(secret));
    expect(await open([m.png, m.wav], [], otherKey)).toMatchObject({ kind: 'error', code: 'AUTH_FAIL' });
  });

  it('the token only opens with the right ring positions', async () => {
    const m = throughMediums(await seal(secret));
    // Token is the only second shard, ring is wrong: reported as an authentication failure.
    expect(await open([m.png], [m.token], otherRing)).toMatchObject({ kind: 'error', code: 'AUTH_FAIL' });
  });

  it('a token that cannot be opened is ignored when two raw shards are already present', async () => {
    const m = throughMediums(await seal(secret));
    // Same Spatial Key hash (so the final decrypt works) but wrong ring positions: the token fails to open,
    // yet the PNG + WAV shards alone still recover the secret.
    const wrongRing: SpatialKeySnapshot = { ...key, ringSegmentPositions: [9, 1, 2, 3, 4, 5, 6, 7] };
    expect(plaintextOf(await open([m.png, m.wav], [m.token], wrongRing))).toEqual(secret);
  });

  it('shards from two different sets never combine', async () => {
    const one = throughMediums(await seal(secret));
    const two = throughMediums(await seal(secret));
    expect(await open([one.png, two.wav], [])).toMatchObject({ kind: 'error', code: 'INVALID_INPUT' });
  });

  it('a malformed token is rejected without exposing anything', async () => {
    const m = throughMediums(await seal(secret));
    const junk = new TextEncoder().encode('{"format":"nope"}');
    expect(await open([m.png], [junk])).toMatchObject({ kind: 'error', code: 'INSUFFICIENT_SHARDS' });
  });

  it('enforces the size cap before doing any work', async () => {
    const r = await handleCryptoMessage(
      req('horcruxSeal', {
        payload: new Uint8Array(HORCRUX_MAX_SECRET_BYTES + 1),
        passphrase: PASS,
        spatialKeySnapshot: key,
      }),
    );
    expect(r).toMatchObject({ kind: 'error', code: 'HORCRUX_TOO_LARGE' });
  });

  it('honours the TTL inside a Horcrux set', async () => {
    const m = throughMediums(await seal(secret, 10_000));
    const ok = await open([m.png, m.wav], [], key, PASS, 9_999);
    expect((ok as { payload: { expiresAt?: number } }).payload.expiresAt).toBe(10_000);
    expect(plaintextOf(ok)).toEqual(secret);
    const late = await open([m.png, m.wav], [], key, PASS, 10_001);
    expect(late).toMatchObject({ kind: 'error', code: 'EXPIRED' });
    expect('payload' in late).toBe(false);
  });

  it('recovers arbitrary secrets from arbitrary pairs (property)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 1500 }),
        fc.constantFrom('png+wav', 'png+token', 'wav+token'),
        async (data, pair) => {
          const m = throughMediums(await seal(data));
          const result =
            pair === 'png+wav'
              ? await open([m.png, m.wav], [])
              : pair === 'png+token'
                ? await open([m.png], [m.token])
                : await open([m.wav], [m.token]);
          expect(plaintextOf(result)).toEqual(data);
        },
      ),
      { numRuns: 4 },
    );
  }, 120_000);
});
