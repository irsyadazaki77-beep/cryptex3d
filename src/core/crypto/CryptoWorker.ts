/**
 * CryptoWorker: dedicated module Worker for AES-256-GCM encrypt/decrypt.
 * Must not import React or Three.js. Never logs plaintext, passphrases,
 * or key material; errors carry codes only.
 *
 * Spawn with: new Worker(new URL('./CryptoWorker.ts', import.meta.url), { type: 'module' })
 */
import type { SpatialKeySnapshot, WorkerErrorCode, WorkerMessage } from '../../store/types';
import { deriveKey, InvalidPassphraseError } from './KeyDeriver';
import { encryptDetached } from './Encryptor';
import { decryptDetached, AuthFailError } from './Decryptor';

export interface EncryptRequestPayload {
  payload: Uint8Array;
  passphrase: string;
  spatialKeySnapshot: SpatialKeySnapshot;
}

export interface DecryptRequestPayload {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  /** Stored salt. Ignored on purpose; see handleDecrypt. */
  salt?: Uint8Array;
  tag: Uint8Array;
  passphrase: string;
  spatialKeySnapshot: SpatialKeySnapshot;
}

export interface EncryptResponsePayload {
  iv: Uint8Array;
  salt: Uint8Array;
  ciphertext: Uint8Array;
  tag: Uint8Array;
}

export interface DecryptResponsePayload {
  plaintext: Uint8Array;
}

/** Response envelope: either a `response` or an `error` message. */
export type CryptoReply = WorkerMessage;

function errorReply(id: string, op: string, code: WorkerErrorCode, message: string): CryptoReply {
  return { kind: 'error', id, target: 'crypto', op, code, message };
}

async function handleEncrypt(id: string, p: EncryptRequestPayload): Promise<CryptoReply> {
  const { key, salt } = await deriveKey(p.passphrase, p.spatialKeySnapshot.serializedHash);
  const { iv, ciphertext, tag } = await encryptDetached(key, p.payload);
  const payload: EncryptResponsePayload = { iv, salt, ciphertext, tag };
  return { kind: 'response', id, target: 'crypto', op: 'encrypt', payload };
}

/**
 * The salt is recomputed from the passphrase and the CURRENT spatial key hash
 * (inside deriveKey), never taken from the message. A different spatial key
 * therefore yields a different AES key and GCM authentication fails.
 */
async function handleDecrypt(id: string, p: DecryptRequestPayload): Promise<CryptoReply> {
  const { key } = await deriveKey(p.passphrase, p.spatialKeySnapshot.serializedHash);
  const plaintext = await decryptDetached(key, p.iv, p.ciphertext, p.tag);
  const payload: DecryptResponsePayload = { plaintext };
  return { kind: 'response', id, target: 'crypto', op: 'decrypt', payload };
}

/** Pure message handler; testable without a Worker. Never throws. */
export async function handleCryptoMessage(msg: WorkerMessage): Promise<CryptoReply> {
  if (msg.kind !== 'request' || msg.target !== 'crypto') {
    return errorReply(msg.id, 'op' in msg ? msg.op : '', 'INVALID_INPUT', 'Unsupported message');
  }
  try {
    switch (msg.op) {
      case 'encrypt':
        return await handleEncrypt(msg.id, msg.payload as EncryptRequestPayload);
      case 'decrypt':
        return await handleDecrypt(msg.id, msg.payload as DecryptRequestPayload);
      default:
        return errorReply(msg.id, msg.op, 'INVALID_INPUT', 'Unknown operation');
    }
  } catch (e) {
    if (e instanceof InvalidPassphraseError) {
      return errorReply(msg.id, msg.op, 'INVALID_PASSPHRASE', 'Invalid passphrase length');
    }
    if (e instanceof AuthFailError) {
      return errorReply(msg.id, msg.op, 'AUTH_FAIL', 'Authentication failed');
    }
    // Generic: never forward e.message, it could contain sensitive context.
    return errorReply(msg.id, msg.op, 'INTERNAL', 'Crypto operation failed');
  }
}

// Worker wiring: only active inside a DedicatedWorkerGlobalScope.
const isWorkerScope =
  typeof self !== 'undefined' &&
  typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== 'undefined' &&
  self instanceof (globalThis as unknown as { WorkerGlobalScope: new () => object }).WorkerGlobalScope;

if (isWorkerScope) {
  const scope = self as unknown as {
    onmessage: ((ev: MessageEvent<WorkerMessage>) => void) | null;
    postMessage: (m: unknown, transfer?: Transferable[]) => void;
  };
  scope.onmessage = (ev) => {
    void handleCryptoMessage(ev.data).then((reply) => scope.postMessage(reply));
  };
}
