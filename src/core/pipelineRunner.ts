/**
 * PipelineRunner: orchestrates encrypt -> embed -> audit and extract -> decrypt
 * through the crypto, stego and auditor workers, each wrapped by WorkerManager
 * (lazy start, 30 s idle terminate, transparent restart).
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
import type { EncryptResponsePayload, DecryptResponsePayload } from './crypto/CryptoWorker';
import type { EmbedResponsePayload, ExtractResponsePayload } from './stego/StegoWorker';

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

export function createPipelineRunner(workers: PipelineWorkers): PipelineRunner {
  const store = useVaultStore;
  const setState = store.getState().setPipelineState;

  return {
    async encryptEmbed({ file, passphrase, spatialKeySnapshot, carrier: suppliedCarrier }) {
      // An empty carrier means none is set; generate a default noise carrier on demand.
      const carrier = suppliedCarrier.length > 0 ? suppliedCarrier : await generateCarrierPNG();
      setState('encrypt', 'encrypting');
      const enc = await workers.crypto.request<EncryptResponsePayload>(
        req('crypto', 'encrypt', { payload: file, passphrase, spatialKeySnapshot }),
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

      // Audit is advisory: a failure must not fail the pipeline.
      setState('encrypt', 'auditing');
      try {
        const report = await workers.auditor.request<AuditReport>(
          req('auditor', 'audit', {
            carrierPNG: emb.stegoCarrier,
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
      setState('decrypt', 'complete');
    },
  };
}

/** Creates the default workers and registers the runner with the store. */
export function installPipelineRunner(): void {
  registerPipelineRunner(createPipelineRunner(createDefaultWorkers()));
}

export type { WorkerMessage };
