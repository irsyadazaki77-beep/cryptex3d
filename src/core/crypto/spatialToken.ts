/**
 * Encrypted JSON Spatial Token: shard 3 of a Horcrux set, bound to the Cryptex Ring.
 *
 * The shard record is sealed with AES-256-GCM under a key derived (PBKDF2-SHA-256, same
 * parameters as everywhere else) from the passphrase and a ring-binding hash. The binding
 * hash covers only the eight ring positions, so opening the token requires dialling the ring
 * to the sealed positions. The salt is recomputed from passphrase + binding, never stored:
 * a wrong ring or passphrase fails GCM authentication instead of returning garbage.
 * Web Crypto only. Nothing here logs passphrases, positions, keys or plaintext.
 */
import { deriveKey } from './KeyDeriver';
import { encrypt } from './Encryptor';
import { decrypt } from './Decryptor';
import { base64ToBytes, bytesToBase64, toHex } from './base64';

export const TOKEN_FORMAT = 'cryptex3d-spatial-token';
export const TOKEN_VERSION = 1;
const MAX_TOKEN_BYTES = 4 * 1024 * 1024;

export class TokenFormatError extends Error {
  readonly code = 'INVALID_INPUT';
  constructor() {
    super('Invalid spatial token');
    this.name = 'TokenFormatError';
  }
}

/** SHA-256 hex of the ring positions, domain-separated from the full Spatial Key hash. */
export async function ringBindingHash(positions: readonly number[]): Promise<string> {
  if (positions.length === 0 || positions.some((p) => !Number.isInteger(p) || p < 0 || p > 9)) {
    throw new TokenFormatError();
  }
  const input = new TextEncoder().encode(`cryptex3d-ring-v1:${positions.join(',')}`);
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', input)));
}

/** Seals a shard record. Returns the UTF-8 bytes of the token JSON file. */
export async function sealSpatialToken(
  record: Uint8Array,
  passphrase: string,
  ringHash: string,
): Promise<Uint8Array> {
  const { key } = await deriveKey(passphrase, ringHash);
  const inner = new TextEncoder().encode(JSON.stringify({ v: TOKEN_VERSION, record: bytesToBase64(record) }));
  const { iv, ciphertext } = await encrypt(key, inner);
  const file = {
    format: TOKEN_FORMAT,
    version: TOKEN_VERSION,
    cipher: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    note: 'Dial the Cryptex Ring to the sealed positions and enter the passphrase to open this token.',
    iv: bytesToBase64(iv),
    data: bytesToBase64(ciphertext),
  };
  return new TextEncoder().encode(`${JSON.stringify(file, null, 2)}\n`);
}

function parseTokenFile(bytes: Uint8Array): { iv: Uint8Array; data: Uint8Array } {
  if (bytes.length === 0 || bytes.length > MAX_TOKEN_BYTES) throw new TokenFormatError();
  try {
    const obj: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (typeof obj !== 'object' || obj === null) throw new TokenFormatError();
    const o = obj as Record<string, unknown>;
    if (o.format !== TOKEN_FORMAT || o.version !== TOKEN_VERSION) throw new TokenFormatError();
    if (typeof o.iv !== 'string' || typeof o.data !== 'string') throw new TokenFormatError();
    const iv = base64ToBytes(o.iv);
    const data = base64ToBytes(o.data);
    if (iv.length !== 12 || data.length < 17) throw new TokenFormatError();
    return { iv, data };
  } catch (e) {
    if (e instanceof TokenFormatError) throw e;
    throw new TokenFormatError();
  }
}

/**
 * Opens a token and returns the shard record inside.
 * @throws TokenFormatError for a malformed file
 * @throws AuthFailError (code AUTH_FAIL) for a wrong passphrase or ring positions
 */
export async function openSpatialToken(
  tokenBytes: Uint8Array,
  passphrase: string,
  ringHash: string,
): Promise<Uint8Array> {
  const { iv, data } = parseTokenFile(tokenBytes);
  const { key } = await deriveKey(passphrase, ringHash);
  const inner = await decrypt(key, iv, data);
  try {
    const obj: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(inner));
    const o = obj as { v?: unknown; record?: unknown };
    if (o.v !== TOKEN_VERSION || typeof o.record !== 'string') throw new TokenFormatError();
    return base64ToBytes(o.record);
  } catch (e) {
    if (e instanceof TokenFormatError) throw e;
    throw new TokenFormatError();
  } finally {
    inner.fill(0);
  }
}
