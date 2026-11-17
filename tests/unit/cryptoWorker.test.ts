import { describe, it, expect } from 'vitest';
import { handleCryptoMessage } from '../../src/core/crypto/CryptoWorker';
import type { SpatialKeySnapshot, WorkerMessage } from '../../src/store/types';

const sk = (hash: string): SpatialKeySnapshot => ({
  monolithRotationX: 0,
  monolithRotationY: 0,
  monolithRotationZ: 0,
  ringSegmentPositions: [0, 0, 0],
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

describe('handleCryptoMessage', () => {
  it('round-trips, and rejects a different spatial key with AUTH_FAIL', async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const enc = await handleCryptoMessage(
      req('encrypt', { payload: data, passphrase: 'correct horse', spatialKeySnapshot: sk('a'.repeat(64)) }),
    );
    expect(enc.kind).toBe('response');
    const bundle = (enc as { payload: Record<string, Uint8Array> }).payload;
    expect(bundle.salt.byteLength).toBe(16);

    const ok = await handleCryptoMessage(
      req('decrypt', { ...bundle, passphrase: 'correct horse', spatialKeySnapshot: sk('a'.repeat(64)) }),
    );
    expect((ok as { payload: { plaintext: Uint8Array } }).payload.plaintext).toEqual(data);

    const bad = await handleCryptoMessage(
      req('decrypt', { ...bundle, passphrase: 'correct horse', spatialKeySnapshot: sk('b'.repeat(64)) }),
    );
    expect(bad).toMatchObject({ kind: 'error', code: 'AUTH_FAIL' });
  });

  it('returns INVALID_PASSPHRASE for a short passphrase', async () => {
    const r = await handleCryptoMessage(
      req('encrypt', { payload: new Uint8Array(1), passphrase: 'short', spatialKeySnapshot: sk('a') }),
    );
    expect(r).toMatchObject({ kind: 'error', code: 'INVALID_PASSPHRASE' });
  });
});
