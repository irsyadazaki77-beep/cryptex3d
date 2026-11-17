/**
 * PipelineRunner: orchestrates encrypt -> embed -> audit and extract -> decrypt
 * through the crypto, stego and auditor workers, each wrapped by WorkerManager
 * (lazy start, 30 s idle terminate, transparent restart). Also drives Horcrux Mode:
 * a 2-of-3 split across a PNG (stego), a WAV (stego) and a ring-bound token (crypto).
 *
 * Loaded lazily via dynamic import from main.tsx so the store never statically
 * imports workers. Passphrases are only placed in message fields; nothing here
 * logs or stores them, and failures rethrow code-only errors.
 */
import { registerPipelineRunner, useVaultStore, type PipelineRunner } from '../store/vaultStore';
import type { AuditReport, WorkerMessage, WorkerTarget } from '../store/types';
import {
  createManagedWorker,
  WorkerRequestError,
  type ManagedWorker,
  type RequestMessage,
} from './WorkerManager';
import { generateCarrierPNG } from './shared/carrierGenerator';
import type {
  DecryptResponsePayload,
  EncryptResponsePayload,
  HorcruxSealResponsePayload,
} from './crypto/CryptoWorker';
import type {
  EmbedAudioResponsePayload,
  EmbedResponsePayload,
  ExtractRawResponsePayload,
  ExtractResponsePayload,
} from './stego/StegoWorker';

export interface PipelineWorkers {
  crypto: ManagedWorker;
  stego: ManagedWorker;
  auditor: ManagedWorker;
}

/** Literal `new Worker(new URL(...))` calls are required for bundler detection. */
export function createDefaultWorkers(): PipelineWorkers {
  return {
    crypto: createManagedWorker(
      () => new Worker(new URL('./crypto/CryptoWorker.ts', import.meta.url), { type: 'module' }),
    ),
    stego: createManagedWorker(
      () => new Worker(new URL('./stego/StegoWorker.ts', import.meta.url), { type: 'module' }),
    ),
    auditor: createManagedWorker(
      () => new Worker(new URL('./auditor/AuditorWorker.ts', import.meta.url), { type: 'module' }),
    ),
  };
}

let counter = 0;
function nextId(): string {
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER;
  return `req-${counter}`;
}

function req(target: WorkerTarget, op: string, payload: unknown): RequestMessage {
  return { kind: 'request', id: nextId(), target, op, payload };
}

/** Expiry instant for a TTL in milliseconds, or undefined when no TTL was requested. */
function expiryFor(ttlMs: number | undefined): number | undefined {
  return ttlMs !== undefined && ttlMs > 0 ? Date.now() + Math.floor(ttlMs) : undefined;
}

export function createPipelineRunner(workers: PipelineWorkers): PipelineRunner {
  const store = useVaultStore;
  const setState = store.getState().setPipelineState;

  /** Audit is advisory: a failure must not fail the pipeline. */
  const runAdvisoryAudit = async (carrierPNG: Uint8Array): Promise<void> => {
    setState('encrypt', 'auditing');
    try {
      const report = await workers.auditor.request<AuditReport>(
        req('auditor', 'audit', {
          carrierPNG,
          advancedAudit: store.getState().advancedAudit,
        }),
      );
      store.getState().setAuditFailed(false);
      store.getState().setAuditReport(report);
    } catch (e) {
      if (!(e instanceof WorkerRequestError)) throw e;
      store.getState().setAuditReport(null);
      store.getState().setAuditFailed(true);
    }
  };

  return {
    async encryptEmbed({ file, passphrase, spatialKeySnapshot, carrier: suppliedCarrier, ttlMs }) {
      // An empty carrier means none is set; generate a default noise carrier on demand.
      const carrier = suppliedCarrier.length > 0 ? suppliedCarrier : await generateCarrierPNG();
      setState('encrypt', 'encrypting');
      const expiresAt = expiryFor(ttlMs);
      const enc = await workers.crypto.request<EncryptResponsePayload>(
        req('crypto', 'encrypt', {
          payload: file,
          passphrase,
          spatialKeySnapshot,
          ...(expiresAt !== undefined ? { expiresAt } : {}),
        }),
      );
      setState('encrypt', 'embedding');
      const emb = await workers.stego.request<EmbedResponsePayload>(
        req('stego', 'embed', {
          carrierPNG: carrier,
          ciphertext: enc.ciphertext,
          iv: enc.iv,
          salt: enc.salt,
          tag: enc.tag,
        }),
      );
      store.getState().setStegoCarrier(emb.stegoCarrier);
      await runAdvisoryAudit(emb.stegoCarrier);
      setState('encrypt', 'complete');
    },

    async extractDecrypt({ passphrase, spatialKeySnapshot, carrier }) {
      setState('decrypt', 'extracting');
      const ext = await workers.stego.request<ExtractResponsePayload>(
        req('stego', 'extract', { carrierPNG: carrier }),
      );
      setState('decrypt', 'decrypting');
      const dec = await workers.crypto.request<DecryptResponsePayload>(
        req('crypto', 'decrypt', {
          ciphertext: ext.ciphertext,
          iv: ext.iv,
          salt: ext.salt,
          tag: ext.tag,
          passphrase,
          spatialKeySnapshot,
        }),
      );
      store.getState().setDecryptedPayload(dec.plaintext);
      store.getState().setDecryptExpiresAt(dec.expiresAt ?? null);
      setState('decrypt', 'complete');
    },

    async sealHorcrux({ file, passphrase, spatialKeySnapshot, ttlMs }) {
      setState('encrypt', 'encrypting');
      const expiresAt = expiryFor(ttlMs);
      const sealed = await workers.crypto.request<HorcruxSealResponsePayload>(
        req('crypto', 'horcruxSeal', {
          payload: file,
          passphrase,
          spatialKeySnapshot,
          ...(expiresAt !== undefined ? { expiresAt } : {}),
        }),
      );
      setState('encrypt', 'embedding');
      // Shard 1 -> PNG LSBs (always a fresh noise carrier), shard 2 -> WAV LSBs, shard 3 is the token.
      const carrier = await generateCarrierPNG();
      const png = await workers.stego.request<EmbedResponsePayload>(
        req('stego', 'embedRaw', { carrierPNG: carrier, record: sealed.pngRecord }),
      );
      const wav = await workers.stego.request<EmbedAudioResponsePayload>(
        req('stego', 'embedAudio', { record: sealed.wavRecord }),
      );
      store.getState().setHorcruxShards({
        monolithPng: png.stegoCarrier,
        crystalWav: wav.wav,
        ringToken: sealed.token,
        setId: sealed.setId,
        expiresAt: expiresAt ?? null,
      });
      await runAdvisoryAudit(png.stegoCarrier);
      setState('encrypt', 'complete');
    },

    async recoverHorcrux({ passphrase, spatialKeySnapshot, shards }) {
      setState('decrypt', 'extracting');
      const records: Uint8Array[] = [];
      const tokens: Uint8Array[] = [];
      let firstFailure: WorkerRequestError | null = null;
      for (const shard of shards) {
        try {
          if (shard.kind === 'png') {
            const r = await workers.stego.request<ExtractRawResponsePayload>(
              req('stego', 'extractRaw', { carrierPNG: shard.bytes }),
            );
            records.push(r.record);
          } else if (shard.kind === 'wav') {
            const r = await workers.stego.request<ExtractRawResponsePayload>(
              req('stego', 'extractAudio', { wav: shard.bytes }),
            );
            records.push(r.record);
          } else {
            tokens.push(shard.bytes);
          }
        } catch (e) {
          if (!(e instanceof WorkerRequestError)) throw e;
          firstFailure ??= e; // a damaged shard only matters if fewer than two others are usable
        }
      }
      if (records.length + tokens.length < 2) {
        throw firstFailure ?? new WorkerRequestError('INSUFFICIENT_SHARDS');
      }
      setState('decrypt', 'decrypting');
      const dec = await workers.crypto.request<DecryptResponsePayload>(
        req('crypto', 'horcruxOpen', { records, tokens, passphrase, spatialKeySnapshot }),
      );
      store.getState().setDecryptedPayload(dec.plaintext);
      store.getState().setDecryptExpiresAt(dec.expiresAt ?? null);
      setState('decrypt', 'complete');
    },
  };
}

/** Creates the default workers and registers the runner with the store. */
export function installPipelineRunner(): void {
  registerPipelineRunner(createPipelineRunner(createDefaultWorkers()));
}

export type { WorkerMessage };
