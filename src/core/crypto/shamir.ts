/**
 * Shamir's Secret Sharing over GF(2^8) (AES polynomial 0x11b), pure TypeScript.
 *
 * Each secret byte is the constant term of its own random polynomial of degree
 * `threshold - 1`; share `x` holds the polynomial evaluated at `x` (1..255). Any
 * `threshold` shares recover the secret by Lagrange interpolation at 0. Fewer reveal
 * nothing: for a single share (x, y) and ANY candidate secret there is exactly one
 * coefficient choice that produces it, so every secret is equally likely.
 *
 * Randomness comes from `crypto.getRandomValues` only. No third-party libraries.
 * Shares carry no integrity check on their own; callers authenticate them (Cryptex3D
 * does so with the stego SHA-256 checksum and AES-GCM).
 */
import { randomBytes } from '../shared/secureWipe';

export class ShamirError extends Error {
  readonly code: 'INVALID_INPUT' | 'INSUFFICIENT_SHARDS';
  constructor(code: 'INVALID_INPUT' | 'INSUFFICIENT_SHARDS', message: string) {
    super(message);
    this.name = 'ShamirError';
    this.code = code;
  }
}

export interface Share {
  /** Evaluation point, 1..255 (never 0, which is the secret). */
  x: number;
  /** One byte per secret byte. */
  data: Uint8Array;
}

/** Fills `buf` with random bytes. Injectable so tests can prove the secrecy argument. */
export type RandomFill = (buf: Uint8Array) => void;

const defaultFill: RandomFill = (buf) => buf.set(randomBytes(buf.length));

/** GF(256) multiplication, branch-free on the operands (fixed 8 iterations). */
export function gfMul(a: number, b: number): number {
  let x = a & 0xff;
  let y = b & 0xff;
  let p = 0;
  for (let i = 0; i < 8; i++) {
    p ^= x & -(y & 1);
    const hi = (x >> 7) & 1;
    x = (x << 1) & 0xff;
    x ^= 0x1b & -hi;
    y >>= 1;
  }
  return p;
}

/** Multiplicative inverse: a^254. The exponent is public, so a fixed ladder is fine. */
export function gfInv(a: number): number {
  if ((a & 0xff) === 0) throw new ShamirError('INVALID_INPUT', 'Zero has no inverse');
  let result = 1;
  let base = a & 0xff;
  let e = 254;
  while (e > 0) {
    if (e & 1) result = gfMul(result, base);
    base = gfMul(base, base);
    e >>= 1;
  }
  return result;
}

/**
 * Splits `secret` into `total` shares, any `threshold` of which reconstruct it.
 * @throws ShamirError for an empty secret or an invalid (threshold, total).
 */
export function split(
  secret: Uint8Array,
  threshold: number,
  total: number,
  fill: RandomFill = defaultFill,
): Share[] {
  if (secret.length === 0) throw new ShamirError('INVALID_INPUT', 'Secret must not be empty');
  if (!Number.isInteger(threshold) || !Number.isInteger(total) || threshold < 2 || total < threshold || total > 255) {
    throw new ShamirError('INVALID_INPUT', 'Invalid threshold/total');
  }
  const n = secret.length;
  const coeffs: Uint8Array[] = [];
  for (let j = 1; j < threshold; j++) {
    const c = new Uint8Array(n);
    fill(c);
    coeffs.push(c);
  }
  const shares: Share[] = [];
  for (let x = 1; x <= total; x++) {
    const data = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      // Horner: s + x(a1 + x(a2 + ...))
      let acc = coeffs[threshold - 2][i];
      for (let j = threshold - 3; j >= 0; j--) acc = coeffs[j][i] ^ gfMul(acc, x);
      data[i] = secret[i] ^ gfMul(acc, x);
    }
    shares.push({ x, data });
  }
  for (const c of coeffs) c.fill(0);
  return shares;
}

/**
 * Reconstructs the secret from at least `threshold` consistent shares (uses the first
 * `threshold` of them).
 * @throws ShamirError(INSUFFICIENT_SHARDS) with fewer than `threshold` shares
 * @throws ShamirError(INVALID_INPUT) for duplicate/zero x or unequal lengths
 */
export function combine(shares: readonly Share[], threshold: number): Uint8Array {
  if (!Number.isInteger(threshold) || threshold < 2) throw new ShamirError('INVALID_INPUT', 'Invalid threshold');
  if (shares.length < threshold) throw new ShamirError('INSUFFICIENT_SHARDS', 'Not enough shares');
  const used = shares.slice(0, threshold);
  const n = used[0].data.length;
  const seen = new Set<number>();
  for (const s of used) {
    if (!Number.isInteger(s.x) || s.x < 1 || s.x > 255 || seen.has(s.x) || s.data.length !== n) {
      throw new ShamirError('INVALID_INPUT', 'Invalid or duplicate share');
    }
    seen.add(s.x);
  }
  // Lagrange weights at 0: l_i = prod_{j != i} x_j / (x_i xor x_j)
  const weights = used.map((si, i) => {
    let w = 1;
    for (let j = 0; j < used.length; j++) {
      if (j === i) continue;
      w = gfMul(w, gfMul(used[j].x, gfInv(si.x ^ used[j].x)));
    }
    return w;
  });
  const out = new Uint8Array(n);
  for (let b = 0; b < n; b++) {
    let acc = 0;
    for (let i = 0; i < used.length; i++) acc ^= gfMul(weights[i], used[i].data[b]);
    out[b] = acc;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Shard record: the self-describing byte string stored in each medium.
//   0  4  magic "CXH\x01"
//   4  8  set id (random, ties shards of one split together)
//  12  1  x
//  13  1  threshold
//  14  1  total
//  15  1  reserved (0)
//  16  4  data length (big-endian)
//  20  n  share bytes
// ---------------------------------------------------------------------------
export const RECORD_MAGIC = new Uint8Array([0x43, 0x58, 0x48, 0x01]);
export const RECORD_HEADER_BYTES = 20;
export const SET_ID_BYTES = 8;

export interface ShardRecord {
  setId: Uint8Array;
  threshold: number;
  total: number;
  share: Share;
}

export function serializeRecord(rec: ShardRecord): Uint8Array {
  const n = rec.share.data.length;
  const out = new Uint8Array(RECORD_HEADER_BYTES + n);
  out.set(RECORD_MAGIC, 0);
  out.set(rec.setId, 4);
  out[12] = rec.share.x;
  out[13] = rec.threshold;
  out[14] = rec.total;
  new DataView(out.buffer).setUint32(16, n, false);
  out.set(rec.share.data, RECORD_HEADER_BYTES);
  return out;
}

/** @throws ShamirError(INVALID_INPUT) for anything that is not a well-formed record. */
export function parseRecord(bytes: Uint8Array): ShardRecord {
  const bad = (): never => {
    throw new ShamirError('INVALID_INPUT', 'Invalid shard record');
  };
  if (bytes.length <= RECORD_HEADER_BYTES) return bad();
  for (let i = 0; i < RECORD_MAGIC.length; i++) if (bytes[i] !== RECORD_MAGIC[i]) return bad();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = view.getUint32(16, false);
  const x = bytes[12];
  const threshold = bytes[13];
  const total = bytes[14];
  if (n !== bytes.length - RECORD_HEADER_BYTES || x < 1 || threshold < 2 || total < threshold) return bad();
  return {
    setId: bytes.slice(4, 4 + SET_ID_BYTES),
    threshold,
    total,
    share: { x, data: bytes.slice(RECORD_HEADER_BYTES) },
  };
}

/** Combines parsed records that belong to one split. */
export function combineRecords(records: readonly ShardRecord[]): Uint8Array {
  if (records.length === 0) throw new ShamirError('INSUFFICIENT_SHARDS', 'No shards supplied');
  const first = records[0];
  const same = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i]);
  for (const r of records) {
    if (!same(r.setId, first.setId) || r.threshold !== first.threshold || r.total !== first.total) {
      throw new ShamirError('INVALID_INPUT', 'Shards belong to different sets');
    }
  }
  const distinct = new Map<number, Share>();
  for (const r of records) if (!distinct.has(r.share.x)) distinct.set(r.share.x, r.share);
  return combine([...distinct.values()], first.threshold);
}

/** Fresh random set id for a new split. */
export function newSetId(): Uint8Array {
  return randomBytes(SET_ID_BYTES);
}
