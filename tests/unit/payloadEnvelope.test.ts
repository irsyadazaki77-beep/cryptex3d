import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  ENVELOPE_HEADER_BYTES,
  ENVELOPE_MAGIC,
  EnvelopeInputError,
  isExpired,
  unwrapPayload,
  wrapPayload,
} from '../../src/core/crypto/payloadEnvelope';
import { handleCryptoMessage } from '../../src/core/crypto/CryptoWorker';
import type { SpatialKeySnapshot, WorkerMessage } from '../../src/store/types';

const sk = (hash: string): SpatialKeySnapshot => ({
  monolithRotationX: 0,
  monolithRotationY: 0,
  monolithRotationZ: 0,
  ringSegmentPositions: [0, 1, 2, 3, 4, 5, 6, 7],
  crystalActivated: false,
  serializedHash: hash,
});
const req = (op: string, payload: unknown): WorkerMessage => ({
  kind: 'request',
  id: '1',
  target: 'crypto',
  op,
  payload,
});
const PASS = 'correct horse battery';
const KEY = sk('a'.repeat(64));

describe('payloadEnvelope', () => {
  it('passes a plain payload through untouched (same instance)', () => {
    const p = new Uint8Array([1, 2, 3]);
    expect(wrapPayload(p)).toBe(p);
    expect(unwrapPayload(p)).toEqual({ payload: p, expiresAt: null, wrapped: false });
  });

  it('round-trips any payload and any expiry', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 200 }), fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }), (p, exp) => {
        const u = unwrapPayload(wrapPayload(p, exp));
        expect(u.wrapped).toBe(true);
        expect(u.expiresAt).toBe(exp);
        expect(u.payload).toEqual(p);
      }),
    );
  });

  it('escapes a plain payload that starts with the magic so unwrap is unambiguous', () => {
    const tricky = new Uint8Array(ENVELOPE_HEADER_BYTES + 4);
    tricky.set(ENVELOPE_MAGIC, 0);
    tricky.set([9, 9, 9, 9], ENVELOPE_HEADER_BYTES);
    const u = unwrapPayload(wrapPayload(tricky));
    expect(u.payload).toEqual(tricky);
    expect(u.expiresAt).toBeNull();
  });

  it('rejects non-positive or fractional expiry', () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2]) {
      expect(() => wrapPayload(new Uint8Array(1), bad)).toThrow(EnvelopeInputError);
    }
  });

  it('treats the expiry instant itself as still valid', () => {
    expect(isExpired(1000, 1000)).toBe(false);
    expect(isExpired(1000, 1001)).toBe(true);
    expect(isExpired(null, 9e15)).toBe(false);
  });
});

describe('TTL through the crypto worker handler', () => {
  const data = new Uint8Array([10, 20, 30, 40, 50]);

  async function encryptWith(expiresAt?: number) {
    const enc = await handleCryptoMessage(
      req('encrypt', { payload: data, passphrase: PASS, spatialKeySnapshot: KEY, expiresAt }),
    );
    expect(enc.kind).toBe('response');
    return (enc as { payload: Record<string, Uint8Array> }).payload;
  }
  const decryptAt = (bundle: Record<string, Uint8Array>, now: number, key = KEY) =>
    handleCryptoMessage(req('decrypt', { ...bundle, passphrase: PASS, spatialKeySnapshot: key }), { now: () => now });

  it('decrypts before expiry and reports the expiry', async () => {
    const bundle = await encryptWith(5_000);
    const ok = await decryptAt(bundle, 4_999);
    expect(ok.kind).toBe('response');
    expect((ok as { payload: { plaintext: Uint8Array; expiresAt?: number } }).payload).toEqual({
      plaintext: data,
      expiresAt: 5_000,
    });
  });

  it('refuses after expiry with EXPIRED and returns no plaintext', async () => {
    const bundle = await encryptWith(5_000);
    const late = await decryptAt(bundle, 5_001);
    expect(late).toMatchObject({ kind: 'error', code: 'EXPIRED' });
    expect('payload' in late).toBe(false);
    expect(JSON.stringify(late)).not.toContain('10,20,30');
  });

  it('does not reveal expiry state to a wrong key: AUTH_FAIL comes first', async () => {
    const bundle = await encryptWith(5_000);
    const bad = await decryptAt(bundle, 9_999, sk('b'.repeat(64)));
    expect(bad).toMatchObject({ kind: 'error', code: 'AUTH_FAIL' });
  });

  it('cannot extend the TTL: editing the ciphertext fails authentication', async () => {
    const bundle = await encryptWith(5_000);
    // The header is the first 16 bytes of the plaintext; flipping any ciphertext bit there must fail.
    const tampered = { ...bundle, ciphertext: bundle.ciphertext.slice() };
    tampered.ciphertext[12] ^= 0xff;
    const r = await decryptAt(tampered, 1);
    expect(r).toMatchObject({ kind: 'error', code: 'AUTH_FAIL' });
  });

  it('leaves non-TTL payloads byte-identical to the legacy layout', async () => {
    const bundle = await encryptWith();
    expect(bundle.ciphertext.length).toBe(data.length);
    const ok = await decryptAt(bundle, 1e15);
    expect((ok as { payload: Record<string, unknown> }).payload).toEqual({ plaintext: data });
  });

  it('rejects an invalid expiry with INVALID_INPUT', async () => {
    const r = await handleCryptoMessage(
      req('encrypt', { payload: data, passphrase: PASS, spatialKeySnapshot: KEY, expiresAt: -5 }),
    );
    expect(r).toMatchObject({ kind: 'error', code: 'INVALID_INPUT' });
  });
});
