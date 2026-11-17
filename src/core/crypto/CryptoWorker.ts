/**
 * CryptoWorker: dedicated module Worker for AES-256-GCM encrypt/decrypt and Horcrux sharding.
 * Must not import React or Three.js. Never logs plaintext, passphrases,
 * or key material; errors carry codes only.
 *
 * Spawn with: new Worker(new URL('./CryptoWorker.ts', import.meta.url), { type: 'module' })
 *
 * Requests (kind 'request', target 'crypto'):
 *   op 'encrypt'     { payload, passphrase, spatialKeySnapshot, expiresAt? } -> { iv, salt, ciphertext, tag }
 *   op 'decrypt'     { ciphertext, iv, tag, passphrase, spatialKeySnapshot }  -> { plaintext, expiresAt? }
 *   op 'horcruxSeal' { payload, passphrase, spatialKeySnapshot, expiresAt? }  -> { pngRecord, wavRecord, token, setId }
 *   op 'horcruxOpen' { records, tokens, passphrase, spatialKeySnapshot }      -> { plaintext, expiresAt? }
 */
import type { SpatialKeySnapshot, WorkerErrorCode, WorkerMessage } from '../../store/types';
import { deriveKey, InvalidPassphraseError } from './KeyDeriver';
import { encryptDetached } from './Encryptor';
import { decryptDetached, AuthFailError } from './Decryptor';
import {
  EnvelopeInputError,
  PayloadExpiredError,
  isExpired,
  unwrapPayload,
  wrapPayload,
} from './payloadEnvelope';
import {
  HorcruxTooLargeError,
  InsufficientShardsError,
  openHorcrux,
  sealHorcrux,
} from './horcrux';
import { ShamirError } from './shamir';
import { TokenFormatError } from './spatialToken';

export interface EncryptRequestPayload {
  payload: Uint8Array;
  passphrase: string;
  spatialKeySnapshot: SpatialKeySnapshot;
  /** Optional TTL: epoch milliseconds after which decryption is refused. */
  expiresAt?: number;
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
  /** Present only when the payload carried a TTL (epoch milliseconds). */
  expiresAt?: number;
}

export interface HorcruxSealRequestPayload {
  payload: Uint8Array;
  passphrase: string;
  spatialKeySnapshot: SpatialKeySnapshot;
  expiresAt?: number;
}

export interface HorcruxSealResponsePayload {
  pngRecord: Uint8Array;
  wavRecord: Uint8Array;
  token: Uint8Array;
  setId: string;
}

export interface HorcruxOpenRequestPayload {
  records: Uint8Array[];
  tokens: Uint8Array[];
  passphrase: string;
  spatialKeySnapshot: SpatialKeySnapshot;
}

/** Injectable clock so TTL behaviour is testable. */
export interface CryptoWorkerOptions {
  now?: () => number;
}

/** Response envelope: either a `response` or an `error` message. */
export type CryptoReply = WorkerMessage;

function errorReply(id: string, op: string, code: WorkerErrorCode, message: string): CryptoReply {
  return { kind: 'error', id, target: 'crypto', op, code, message };
}

async function handleEncrypt(id: string, p: EncryptRequestPayload): Promise<CryptoReply> {
  const { key, salt } = await deriveKey(p.passphrase, p.spatialKeySnapshot.serializedHash);
  // Without a TTL the payload passes through unchanged (unless it could be mistaken for an envelope).
  const body = wrapPayload(p.payload, p.expiresAt);
  const { iv, ciphertext, tag } = await encryptDetached(key, body);
  const payload: EncryptResponsePayload = { iv, salt, ciphertext, tag };
  return { kind: 'response', id, target: 'crypto', op: 'encrypt', payload };
}

/**
 * The salt is recomputed from the passphrase and the CURRENT spatial key hash
 * (inside deriveKey), never taken from the message. A different spatial key
 * therefore yields a different AES key and GCM authentication fails.
 *
 * The TTL header sits inside the authenticated plaintext, so it is readable only after the
 * tag verifies. An expired drop returns an error and never the plaintext.
 */
async function handleDecrypt(
  id: string,
  p: DecryptRequestPayload,
  now: () => number,
): Promise<CryptoReply> {
  const { key } = await deriveKey(p.passphrase, p.spatialKeySnapshot.serializedHash);
  const plain = await decryptDetached(key, p.iv, p.ciphertext, p.tag);
  const u = unwrapPayload(plain);
  if (u.wrapped) {
    plain.fill(0);
    if (isExpired(u.expiresAt, now())) {
      u.payload.fill(0);
      throw new PayloadExpiredError();
    }
    const payload: DecryptResponsePayload =
      u.expiresAt === null ? { plaintext: u.payload } : { plaintext: u.payload, expiresAt: u.expiresAt };
    return { kind: 'response', id, target: 'crypto', op: 'decrypt', payload };
  }
  const payload: DecryptResponsePayload = { plaintext: plain };
  return { kind: 'response', id, target: 'crypto', op: 'decrypt', payload };
}

async function handleHorcruxSeal(id: string, p: HorcruxSealRequestPayload): Promise<CryptoReply> {
  const sealed = await sealHorcrux({
    secret: p.payload,
    passphrase: p.passphrase,
    spatialKeyHash: p.spatialKeySnapshot.serializedHash,
    ringPositions: p.spatialKeySnapshot.ringSegmentPositions,
    expiresAt: p.expiresAt,
  });
  const payload: HorcruxSealResponsePayload = sealed;
  return { kind: 'response', id, target: 'crypto', op: 'horcruxSeal', payload };
}

async function handleHorcruxOpen(
  id: string,
  p: HorcruxOpenRequestPayload,
  now: () => number,
): Promise<CryptoReply> {
  const opened = await openHorcrux({
    records: p.records,
    tokens: p.tokens,
    passphrase: p.passphrase,
    spatialKeyHash: p.spatialKeySnapshot.serializedHash,
    ringPositions: p.spatialKeySnapshot.ringSegmentPositions,
    now: now(),
  });
  const payload: DecryptResponsePayload =
    opened.expiresAt === null
      ? { plaintext: opened.plaintext }
      : { plaintext: opened.plaintext, expiresAt: opened.expiresAt };
  return { kind: 'response', id, target: 'crypto', op: 'horcruxOpen', payload };
}

/** Pure message handler; testable without a Worker. Never throws. */
export async function handleCryptoMessage(
  msg: WorkerMessage,
  options: CryptoWorkerOptions = {},
): Promise<CryptoReply> {
  const now = options.now ?? Date.now;
  if (msg.kind !== 'request' || msg.target !== 'crypto') {
    return errorReply(msg.id, 'op' in msg ? msg.op : '', 'INVALID_INPUT', 'Unsupported message');
  }
  try {
    switch (msg.op) {
      case 'encrypt':
        return await handleEncrypt(msg.id, msg.payload as EncryptRequestPayload);
      case 'decrypt':
        return await handleDecrypt(msg.id, msg.payload as DecryptRequestPayload, now);
      case 'horcruxSeal':
        return await handleHorcruxSeal(msg.id, msg.payload as HorcruxSealRequestPayload);
      case 'horcruxOpen':
        return await handleHorcruxOpen(msg.id, msg.payload as HorcruxOpenRequestPayload, now);
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
    if (e instanceof PayloadExpiredError) {
      return errorReply(msg.id, msg.op, 'EXPIRED', 'Dead drop has expired');
    }
    if (e instanceof InsufficientShardsError) {
      return errorReply(msg.id, msg.op, 'INSUFFICIENT_SHARDS', 'At least two valid shards are required');
    }
    if (e instanceof HorcruxTooLargeError) {
      return errorReply(msg.id, msg.op, 'HORCRUX_TOO_LARGE', 'Secret exceeds the Horcrux size limit');
    }
    if (e instanceof EnvelopeInputError || e instanceof ShamirError || e instanceof TokenFormatError) {
      return errorReply(msg.id, msg.op, 'INVALID_INPUT', 'Invalid input');
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
