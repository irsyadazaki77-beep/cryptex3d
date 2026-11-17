/**
 * Integration: spatial key mismatch rejection.
 * Encrypt + embed with spatial key K, then extract + decrypt with K' != K through the
 * real crypto and stego message handlers. Expect AUTH_FAIL and no plaintext anywhere.
 *
 * Browser-only image APIs (createImageBitmap, OffscreenCanvas, ImageData) are absent in
 * Node, so a lossless stand-in is installed: the "PNG" bytes are the raw RGBA pixels.
 * Everything else (key derivation, AES-GCM, LSB embed/extract, packing) is real.
 *
 * **Validates: Requirements 15.5**
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCryptoMessage } from '../../src/core/crypto/CryptoWorker';
import { handleStegoMessage } from '../../src/core/stego/StegoWorker';
import { createPipelineRunner } from '../../src/core/pipelineRunner';
import { WorkerRequestError, type ManagedWorker, type RequestMessage } from '../../src/core/WorkerManager';
import { registerPipelineRunner, useVaultStore } from '../../src/store/vaultStore';
import type { SpatialKeySnapshot, WorkerMessage } from '../../src/store/types';

const SIZE = 1024;

// ---- Lossless image API stand-ins (raw RGBA acts as the "PNG") ----
class FakeImageData {
  data: Uint8ClampedArray;
  constructor(data: Uint8ClampedArray, public width: number, public height: number) {
    this.data = data;
  }
}
class FakeOffscreenCanvas {
  pixels = new Uint8ClampedArray(SIZE * SIZE * 4);
  constructor(public width: number, public height: number) {}
  getContext() {
    return {
      imageSmoothingEnabled: false,
      putImageData: (img: FakeImageData) => {
        this.pixels = new Uint8ClampedArray(img.data);
      },
      drawImage: (bmp: { pixels: Uint8ClampedArray }) => {
        this.pixels = new Uint8ClampedArray(bmp.pixels);
      },
      getImageData: () => ({ data: new Uint8ClampedArray(this.pixels) }),
    };
  }
  async convertToBlob() {
    return new Blob([this.pixels as BlobPart]);
  }
}

function makeCarrier(): Uint8Array {
  const px = new Uint8Array(SIZE * SIZE * 4);
  for (let off = 0; off < px.length; off += 65536) {
    crypto.getRandomValues(px.subarray(off, Math.min(off + 65536, px.length)));
  }
  for (let i = 3; i < px.length; i += 4) px[i] = 255;
  return px;
}

const HASH_K = 'a'.repeat(64);
const HASH_K2 = 'a'.repeat(63) + 'b';

const keyK: SpatialKeySnapshot = {
  monolithRotationX: 0.5,
  monolithRotationY: 1.0,
  monolithRotationZ: 0,
  ringSegmentPositions: [1, 2, 3, 4, 5],
  crystalActivated: false,
  serializedHash: HASH_K,
};
// Differs from K in a single field (ring segment 0) and therefore in the hash.
const keyK2: SpatialKeySnapshot = {
  ...keyK,
  ringSegmentPositions: [2, 2, 3, 4, 5],
  serializedHash: HASH_K2,
};

const SECRET_TEXT = 'TOP-SECRET-PLAINTEXT-4f1e9c';
const PASSPHRASE = 'correct horse battery staple';
const secret = new TextEncoder().encode(SECRET_TEXT);

let counter = 0;
const rq = (target: 'crypto' | 'stego', op: string, payload: unknown): RequestMessage => ({
  kind: 'request',
  id: `t-${++counter}`,
  target,
  op,
  payload,
});

function containsBytes(hay: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

function directWorker(handler: (m: WorkerMessage) => Promise<WorkerMessage>): ManagedWorker {
  return {
    isAlive: false,
    pendingCount: 0,
    post: () => undefined,
    onMessage: () => () => undefined,
    terminate: () => undefined,
    request: async <T>(msg: RequestMessage): Promise<T> => {
      const reply = await handler(msg);
      if (reply.kind === 'error') throw new WorkerRequestError(reply.code);
      if (reply.kind !== 'response') throw new WorkerRequestError('INTERNAL');
      return reply.payload as T;
    },
  };
}

beforeAll(() => {
  vi.stubGlobal('ImageData', FakeImageData);
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  vi.stubGlobal(
    'createImageBitmap',
    async (blob: Blob) => ({
      width: SIZE,
      height: SIZE,
      pixels: new Uint8ClampedArray(await blob.arrayBuffer()),
      close: () => undefined,
    }),
  );
});
afterAll(() => {
  vi.unstubAllGlobals();
  registerPipelineRunner(null);
});

describe('spatial key mismatch (handlers)', () => {
  it('replies AUTH_FAIL with no plaintext when decrypting with K2 != K', async () => {
    const enc = await handleCryptoMessage(
      rq('crypto', 'encrypt', { payload: secret, passphrase: PASSPHRASE, spatialKeySnapshot: keyK }),
    );
    expect(enc.kind).toBe('response');
    if (enc.kind !== 'response') return;
    const e = enc.payload as { iv: Uint8Array; salt: Uint8Array; ciphertext: Uint8Array; tag: Uint8Array };

    const emb = await handleStegoMessage(
      rq('stego', 'embed', { carrierPNG: makeCarrier(), ciphertext: e.ciphertext, iv: e.iv, salt: e.salt, tag: e.tag }),
    );
    expect(emb.kind).toBe('response');
    if (emb.kind !== 'response') return;
    const { stegoCarrier } = emb.payload as { stegoCarrier: Uint8Array };

    const ext = await handleStegoMessage(rq('stego', 'extract', { carrierPNG: stegoCarrier }));
    expect(ext.kind).toBe('response');
    if (ext.kind !== 'response') return;
    const x = ext.payload as { iv: Uint8Array; salt: Uint8Array; ciphertext: Uint8Array; tag: Uint8Array };

    const decArgs = (k: SpatialKeySnapshot) => ({
      ciphertext: x.ciphertext,
      iv: x.iv,
      salt: x.salt,
      tag: x.tag,
      passphrase: PASSPHRASE,
      spatialKeySnapshot: k,
    });

    // Control: the correct key decrypts.
    const ok = await handleCryptoMessage(rq('crypto', 'decrypt', decArgs(keyK)));
    expect(ok.kind).toBe('response');
    if (ok.kind === 'response') {
      expect(new TextDecoder().decode((ok.payload as { plaintext: Uint8Array }).plaintext)).toBe(SECRET_TEXT);
    }

    // Wrong spatial key: error only.
    const bad = await handleCryptoMessage(rq('crypto', 'decrypt', decArgs(keyK2)));
    expect(bad.kind).toBe('error');
    if (bad.kind !== 'error') return;
    expect(bad.code).toBe('AUTH_FAIL');
    expect('payload' in bad).toBe(false);
    expect(JSON.stringify(bad)).not.toContain(SECRET_TEXT);
    expect(bad.message).not.toContain(PASSPHRASE);
  });
});

describe('spatial key mismatch (store + pipeline runner)', () => {
  beforeEach(() => {
    registerPipelineRunner(null);
    useVaultStore.setState({
      spatialKeySnapshot: null,
      stegoCarrier: null,
      decryptedPayload: null,
      lastError: null,
    });
  });

  it('leaves decryptedPayload null and lastError as the code only', async () => {
    const crypto_ = directWorker(handleCryptoMessage);
    const stego = directWorker(handleStegoMessage);
    const auditor = directWorker(async (m) => ({
      kind: 'error', id: m.id, target: 'auditor', op: 'audit', code: 'INTERNAL', message: 'skip',
    }));
    registerPipelineRunner(createPipelineRunner({ crypto: crypto_, stego, auditor }));

    const store = useVaultStore.getState();
    store.setSpatialKeySnapshot(keyK);
    store.setStegoCarrier(makeCarrier());
    await useVaultStore.getState().dispatchEncryptEmbed(secret, PASSPHRASE);
    expect(useVaultStore.getState().lastError).toBeNull();
    const stegoCarrier = useVaultStore.getState().stegoCarrier;
    expect(stegoCarrier).not.toBeNull();

    useVaultStore.getState().setSpatialKeySnapshot(keyK2);
    await useVaultStore.getState().dispatchExtractDecrypt(PASSPHRASE);

    const s = useVaultStore.getState();
    expect(s.decryptedPayload).toBeNull();
    expect(s.lastError).toBe('AUTH_FAIL');
    expect(s.decryptStatus.state).toBe('error');
    expect(s.lastError).not.toContain(SECRET_TEXT);
    expect(containsBytes(s.stegoCarrier as Uint8Array, secret)).toBe(false);
  });
});
