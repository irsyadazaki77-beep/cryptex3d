/**
 * Horcrux Mode: split one encrypted secret across three incompatible mediums.
 *
 *   1. Encrypt the file (optionally inside a TTL envelope) with AES-256-GCM. The key comes from
 *      the passphrase and the full Spatial Key, exactly like a normal dead drop.
 *   2. Split the packed blob (iv | salt | ciphertext | tag) with 2-of-3 Shamir over GF(256).
 *   3. Shard 1 (x=1) is embedded in a PNG's LSBs, shard 2 (x=2) in a WAV's LSBs (stego layer),
 *      and shard 3 (x=3) is sealed in an encrypted JSON token bound to the Cryptex Ring.
 *
 * Any two shards rebuild the blob; the passphrase and Spatial Key are still required to
 * decrypt it. One shard is uniformly random bytes. Web Crypto only; nothing here logs
 * passphrases, keys, shards or plaintext.
 */
import { deriveKey } from './KeyDeriver';
import { encryptDetached } from './Encryptor';
import { decryptDetached, AuthFailError } from './Decryptor';
import { GCM_IV_BYTES, GCM_TAG_BYTES } from './GcmTag';
import {
  ShamirError,
  combineRecords,
  newSetId,
  parseRecord,
  serializeRecord,
  split,
  type ShardRecord,
} from './shamir';
import { PayloadExpiredError, isExpired, unwrapPayload, wrapPayload } from './payloadEnvelope';
import { openSpatialToken, ringBindingHash, sealSpatialToken } from './spatialToken';
import { toHex } from './base64';

export const HORCRUX_THRESHOLD = 2;
export const HORCRUX_TOTAL = 3;
/** Keeps the WAV shard to roughly 12 s of audio. */
export const HORCRUX_MAX_SECRET_BYTES = 65_536;
const SALT_BYTES = 16;

export class HorcruxTooLargeError extends Error {
  readonly code = 'HORCRUX_TOO_LARGE';
  constructor() {
    super('Secret exceeds the Horcrux size limit');
    this.name = 'HorcruxTooLargeError';
  }
}

export class InsufficientShardsError extends Error {
  readonly code = 'INSUFFICIENT_SHARDS';
  constructor() {
    super('At least two valid shards are required');
    this.name = 'InsufficientShardsError';
  }
}

export interface SealInput {
  secret: Uint8Array;
  passphrase: string;
  spatialKeyHash: string;
  ringPositions: readonly number[];
  /** Optional TTL as epoch milliseconds. */
  expiresAt?: number;
}

export interface SealedHorcrux {
  /** Shard record for the PNG LSB carrier (monolith). */
  pngRecord: Uint8Array;
  /** Shard record for the WAV LSB carrier (crystal). */
  wavRecord: Uint8Array;
  /** UTF-8 JSON bytes of the encrypted spatial token (ring). */
  token: Uint8Array;
  /** Hex set id, identical across the three shards. */
  setId: string;
}

function joinBlob(iv: Uint8Array, salt: Uint8Array, ciphertext: Uint8Array, tag: Uint8Array): Uint8Array {
  const out = new Uint8Array(iv.length + salt.length + ciphertext.length + tag.length);
  out.set(iv, 0);
  out.set(salt, iv.length);
  out.set(ciphertext, iv.length + salt.length);
  out.set(tag, iv.length + salt.length + ciphertext.length);
  return out;
}

export async function sealHorcrux(input: SealInput): Promise<SealedHorcrux> {
  if (input.secret.length > HORCRUX_MAX_SECRET_BYTES) throw new HorcruxTooLargeError();
  const body = wrapPayload(input.secret, input.expiresAt);
  const { key, salt } = await deriveKey(input.passphrase, input.spatialKeyHash);
  const { iv, ciphertext, tag } = await encryptDetached(key, body);
  const blob = joinBlob(iv, salt, ciphertext, tag);
  const setId = newSetId();
  const shares = split(blob, HORCRUX_THRESHOLD, HORCRUX_TOTAL);
  blob.fill(0);
  const record = (i: number): Uint8Array =>
    serializeRecord({ setId, threshold: HORCRUX_THRESHOLD, total: HORCRUX_TOTAL, share: shares[i] });
  const ringHash = await ringBindingHash(input.ringPositions);
  const token = await sealSpatialToken(record(2), input.passphrase, ringHash);
  const out = { pngRecord: record(0), wavRecord: record(1), token, setId: toHex(setId) };
  for (const s of shares) s.data.fill(0);
  return out;
}

export interface OpenInput {
  /** Shard records already extracted from PNG / WAV carriers. */
  records: readonly Uint8Array[];
  /** Encrypted spatial token files. */
  tokens: readonly Uint8Array[];
  passphrase: string;
  spatialKeyHash: string;
  ringPositions: readonly number[];
  now: number;
}

export interface OpenedHorcrux {
  plaintext: Uint8Array;
  expiresAt: number | null;
}

/**
 * Rebuilds and decrypts the secret from any two valid shards.
 * @throws InsufficientShardsError when fewer than two shards are usable
 * @throws AuthFailError for a wrong passphrase, Spatial Key, or ring positions
 * @throws PayloadExpiredError when the TTL has passed (no plaintext is returned)
 */
export async function openHorcrux(input: OpenInput): Promise<OpenedHorcrux> {
  const parsed: ShardRecord[] = [];
  let usable = 0;
  for (const bytes of input.records) {
    try {
      parsed.push(parseRecord(bytes));
      usable++;
    } catch (e) {
      if (!(e instanceof ShamirError)) throw e;
    }
  }
  let tokenAuthFailed = false;
  if (input.tokens.length > 0) {
    const ringHash = await ringBindingHash(input.ringPositions);
    for (const token of input.tokens) {
      try {
        parsed.push(parseRecord(await openSpatialToken(token, input.passphrase, ringHash)));
        usable++;
      } catch (e) {
        if (e instanceof AuthFailError) tokenAuthFailed = true;
        else if (!(e instanceof ShamirError) && (e as { code?: string }).code !== 'INVALID_INPUT') throw e;
      }
    }
  }
  const distinct = new Set(parsed.map((r) => r.share.x));
  if (usable < HORCRUX_THRESHOLD || distinct.size < HORCRUX_THRESHOLD) {
    // A token that failed to open is indistinguishable from a wrong passphrase/ring: report it as such.
    if (tokenAuthFailed) throw new AuthFailError();
    throw new InsufficientShardsError();
  }
  const blob = combineRecords(parsed);
  if (blob.length < GCM_IV_BYTES + SALT_BYTES + GCM_TAG_BYTES) throw new AuthFailError();
  const ctEnd = blob.length - GCM_TAG_BYTES;
  const iv = blob.slice(0, GCM_IV_BYTES);
  const ciphertext = blob.slice(GCM_IV_BYTES + SALT_BYTES, ctEnd);
  const tag = blob.slice(ctEnd);
  blob.fill(0);
  // The salt is recomputed from passphrase + current Spatial Key (inside deriveKey), never trusted.
  const { key } = await deriveKey(input.passphrase, input.spatialKeyHash);
  const plain = await decryptDetached(key, iv, ciphertext, tag);
  const u = unwrapPayload(plain);
  if (u.wrapped) {
    plain.fill(0);
    if (isExpired(u.expiresAt, input.now)) {
      u.payload.fill(0);
      throw new PayloadExpiredError();
    }
    return { plaintext: u.payload, expiresAt: u.expiresAt };
  }
  return { plaintext: plain, expiresAt: null };
}
