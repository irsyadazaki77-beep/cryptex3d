/**
 * Integration: self-destructing dead drop, tamper tripwire and Horcrux recovery, driven through
 * the real vault store, pipeline runner and worker handlers.
 *
 * Browser-only image APIs are replaced by a lossless stand-in (the "PNG" bytes are the raw RGBA
 * pixels), exactly like spatialKeyMismatch.test.ts. Key derivation, AES-GCM, Shamir, LSB embed
 * and extract, the WAV carrier and the spatial token are all real.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCryptoMessage } from '../../src/core/crypto/CryptoWorker';
import { handleStegoMessage } from '../../src/core/stego/StegoWorker';
import { createPipelineRunner } from '../../src/core/pipelineRunner';
import { WorkerRequestError, type ManagedWorker, type RequestMessage } from '../../src/core/WorkerManager';
import { registerPipelineRunner, useVaultStore } from '../../src/store/vaultStore';
import { idleTripwire } from '../../src/store/tripwire';
import { SpatialKeySerializer } from '../../src/scene/SpatialKeySerializer';
import type { SpatialKeySnapshot, WorkerMessage } from '../../src/store/types';

const SIZE = 1024;

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

const PASS = 'correct horse battery staple';
const SECRET = new TextEncoder().encode('meet at the lighthouse at midnight');
const T0 = 1_800_000_000_000;

let keyA: SpatialKeySnapshot;
let keyB: SpatialKeySnapshot;

const store = () => useVaultStore.getState();

beforeAll(async () => {
  vi.stubGlobal('ImageData', FakeImageData);
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  vi.stubGlobal('createImageBitmap', async (blob: Blob) => ({
    width: SIZE,
    height: SIZE,
    pixels: new Uint8ClampedArray(await blob.arrayBuffer()),
    close: () => undefined,
  }));
  const ser = new SpatialKeySerializer(() => {});
  keyA = await ser.serialize([10, 20, 30], [0, 1, 2, 3, 4, 5, 6, 7], true);
  keyB = await ser.serialize([10, 20, 30], [1, 1, 2, 3, 4, 5, 6, 7], true);
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  registerPipelineRunner(null);
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); // only the clock; PBKDF2 and promises keep running
  vi.setSystemTime(T0);
  const auditor = directWorker(async (m) => ({
    kind: 'error',
    id: m.id,
    target: 'auditor',
    op: 'audit',
    code: 'INTERNAL',
    message: 'skip',
  }));
  registerPipelineRunner(
    createPipelineRunner({
      crypto: directWorker((m) => handleCryptoMessage(m)),
      stego: directWorker(handleStegoMessage),
      auditor,
    }),
  );
  useVaultStore.setState({
    spatialKeySnapshot: keyA,
    stegoCarrier: null,
    decryptedPayload: null,
    decryptExpiresAt: null,
    lastError: null,
    horcruxShards: null,
    decryptShards: [],
    tripwire: idleTripwire(),
    encryptStatus: { state: 'idle', progressBytes: 0, totalBytes: 0 },
    decryptStatus: { state: 'idle', progressBytes: 0, totalBytes: 0 },
  });
});

describe('self-destructing dead drop (TTL)', () => {
  it('decrypts before the deadline and reports it', async () => {
    await store().dispatchEncryptEmbed(SECRET, PASS, { ttlMs: 60_000 });
    expect(store().lastError).toBeNull();
    vi.setSystemTime(T0 + 59_000);
    await store().dispatchExtractDecrypt(PASS);
    expect(store().decryptedPayload).toEqual(SECRET);
    expect(store().decryptExpiresAt).toBe(T0 + 60_000);
    expect(store().tripwire.tripped).toBe(false);
  });

  it('refuses after the deadline, returns no plaintext and overwrites the carrier', async () => {
    await store().dispatchEncryptEmbed(SECRET, PASS, { ttlMs: 60_000 });
    const carrier = store().stegoCarrier as Uint8Array;
    const before = carrier.slice();
    vi.setSystemTime(T0 + 61_000);
    await store().dispatchExtractDecrypt(PASS);
    const s = store();
    expect(s.lastError).toBe('EXPIRED');
    expect(s.decryptedPayload).toBeNull();
    expect(s.tripwire).toMatchObject({ tripped: true, reason: 'expired' });
    expect(s.stegoCarrier).toBeNull();
    expect(carrier).not.toEqual(before); // the in-memory buffer itself was overwritten
  });

  it('a drop without a TTL never expires', async () => {
    await store().dispatchEncryptEmbed(SECRET, PASS);
    vi.setSystemTime(T0 + 10 * 365 * 24 * 3600 * 1000);
    await store().dispatchExtractDecrypt(PASS);
    expect(store().decryptedPayload).toEqual(SECRET);
    expect(store().decryptExpiresAt).toBeNull();
  });
});

describe('3-attempt tamper tripwire', () => {
  it('trips on the third consecutive wrong attempt and overwrites the carrier buffer', async () => {
    await store().dispatchEncryptEmbed(SECRET, PASS);
    const carrier = store().stegoCarrier as Uint8Array;
    const before = carrier.slice();

    store().setSpatialKeySnapshot(keyB); // wrong artifact positions
    await store().dispatchExtractDecrypt(PASS);
    expect(store().lastError).toBe('AUTH_FAIL');
    expect(store().tripwire.failures).toBe(1);
    expect(carrier).toEqual(before);

    await store().dispatchExtractDecrypt(PASS);
    expect(store().tripwire).toMatchObject({ failures: 2, tripped: false });
    expect(store().stegoCarrier).toBe(carrier);
    expect(carrier).toEqual(before);

    await store().dispatchExtractDecrypt(PASS);
    const s = store();
    expect(s.tripwire).toMatchObject({ tripped: true, reason: 'tripwire' });
    expect(s.lastError).toBe('TRIPWIRE');
    expect(s.stegoCarrier).toBeNull();
    expect(s.decryptedPayload).toBeNull();
    expect(carrier).not.toEqual(before);
    expect(carrier.length).toBe(before.length);
  });

  it('a wrong passphrase counts the same way', async () => {
    await store().dispatchEncryptEmbed(SECRET, PASS);
    for (let i = 0; i < 3; i++) await store().dispatchExtractDecrypt('a wrong passphrase');
    expect(store().tripwire.tripped).toBe(true);
    expect(store().stegoCarrier).toBeNull();
  });

  it('a success in between resets the streak', async () => {
    await store().dispatchEncryptEmbed(SECRET, PASS);
    await store().dispatchExtractDecrypt('a wrong passphrase');
    await store().dispatchExtractDecrypt('another wrong one');
    expect(store().tripwire.failures).toBe(2);
    await store().dispatchExtractDecrypt(PASS);
    expect(store().decryptedPayload).toEqual(SECRET);
    expect(store().tripwire).toEqual(idleTripwire());
    await store().dispatchExtractDecrypt('a wrong passphrase');
    expect(store().tripwire.failures).toBe(1);
    expect(store().tripwire.tripped).toBe(false);
  });

  it('loading a fresh carrier re-arms the tripwire', async () => {
    await store().dispatchEncryptEmbed(SECRET, PASS);
    const original = (store().stegoCarrier as Uint8Array).slice();
    for (let i = 0; i < 3; i++) await store().dispatchExtractDecrypt('a wrong passphrase');
    expect(store().tripwire.tripped).toBe(true);
    store().setStegoCarrier(original);
    expect(store().tripwire).toEqual(idleTripwire());
    await store().dispatchExtractDecrypt(PASS);
    expect(store().decryptedPayload).toEqual(SECRET);
  });
});

describe('Horcrux Mode through the store', () => {
  const seal = async (opts: { ttlMs?: number } = {}) => {
    await store().dispatchEncryptEmbed(SECRET, PASS, { horcrux: true, ...opts });
    expect(store().lastError).toBeNull();
    const shards = store().horcruxShards;
    expect(shards).not.toBeNull();
    return shards!;
  };
  const load = (kinds: Array<'png' | 'wav' | 'token'>, set: Awaited<ReturnType<typeof seal>>) => {
    for (const kind of kinds) {
      const bytes = kind === 'png' ? set.monolithPng : kind === 'wav' ? set.crystalWav : set.ringToken;
      store().addDecryptShard({ kind, name: `shard.${kind}`, bytes: bytes.slice() });
    }
  };

  it('seals three shards in three mediums and leaves the single-carrier slot alone', async () => {
    const set = await seal();
    expect(set.monolithPng.length).toBeGreaterThan(1_000_000); // 1024x1024 RGBA stand-in
    expect(String.fromCharCode(...set.crystalWav.slice(0, 4))).toBe('RIFF');
    expect(JSON.parse(new TextDecoder().decode(set.ringToken)).format).toBe('cryptex3d-spatial-token');
    expect(set.setId).toMatch(/^[0-9a-f]{16}$/);
    expect(store().stegoCarrier).toBeNull();
    expect(store().encryptStatus.state).toBe('complete');
  });

  it('any two of the three shards recover the file', async () => {
    const set = await seal();
    for (const pair of [['png', 'wav'], ['png', 'token'], ['wav', 'token']] as const) {
      store().clearDecryptShards();
      load([...pair], set);
      await store().dispatchHorcruxRecover(PASS);
      expect(store().lastError).toBeNull();
      expect(store().decryptedPayload).toEqual(SECRET);
      store().setDecryptedPayload(null);
    }
  });

  it('one shard alone is refused without counting as a failed attempt', async () => {
    const set = await seal();
    load(['png'], set);
    await store().dispatchHorcruxRecover(PASS);
    expect(store().lastError).toBe('INSUFFICIENT_SHARDS');
    expect(store().decryptedPayload).toBeNull();
    expect(store().tripwire.failures).toBe(0);
  });

  it('wrong ring positions block the token shard', async () => {
    const set = await seal();
    load(['png', 'token'], set);
    store().setSpatialKeySnapshot(keyB); // ring segment 0 differs
    await store().dispatchHorcruxRecover(PASS);
    expect(store().lastError).toBe('AUTH_FAIL');
    expect(store().decryptedPayload).toBeNull();
  });

  it('three wrong passphrases trip the wire and overwrite every loaded shard buffer', async () => {
    const set = await seal();
    load(['png', 'wav'], set);
    const buffers = store().decryptShards.map((s) => s.bytes);
    const before = buffers.map((b) => b.slice(0, 256));
    for (let i = 0; i < 3; i++) await store().dispatchHorcruxRecover('a wrong passphrase');
    expect(store().tripwire).toMatchObject({ tripped: true, reason: 'tripwire' });
    expect(store().decryptShards).toEqual([]);
    buffers.forEach((b, i) => expect(b.slice(0, 256)).not.toEqual(before[i]));
    // The exported shards in the sender's set are separate copies and stay intact.
    expect(store().horcruxShards?.monolithPng.slice(0, 16)).toEqual(set.monolithPng.slice(0, 16));
  });

  it('honours the self-destruct timer', async () => {
    const set = await seal({ ttlMs: 30_000 });
    expect(set.expiresAt).toBe(T0 + 30_000);
    load(['wav', 'token'], set);
    vi.setSystemTime(T0 + 29_000);
    await store().dispatchHorcruxRecover(PASS);
    expect(store().decryptedPayload).toEqual(SECRET);
    expect(store().decryptExpiresAt).toBe(T0 + 30_000);

    store().setDecryptedPayload(null);
    vi.setSystemTime(T0 + 31_000);
    await store().dispatchHorcruxRecover(PASS);
    expect(store().lastError).toBe('EXPIRED');
    expect(store().decryptedPayload).toBeNull();
    expect(store().decryptShards).toEqual([]);
  });

  it('rejects secrets over 64 KB with a typed error', async () => {
    await store().dispatchEncryptEmbed(new Uint8Array(65_537).fill(1), PASS, { horcrux: true });
    expect(store().lastError).toBe('HORCRUX_TOO_LARGE');
    expect(store().horcruxShards).toBeNull();
  });
});
