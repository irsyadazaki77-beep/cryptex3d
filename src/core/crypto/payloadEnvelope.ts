/**
 * TTL envelope. When a dead drop has an expiry, the plaintext is wrapped BEFORE encryption:
 *
 *   0   8  magic  "CX3TTL\0\1"
 *   8   8  expiresAt, big-endian uint64, milliseconds since the Unix epoch (0 = no expiry)
 *  16   n  payload
 *
 * The header therefore sits inside the AES-256-GCM authenticated plaintext: it cannot be read
 * without the key and cannot be edited without failing authentication. A payload that does
 * not start with the magic is a legacy/plain payload and passes through untouched. A plain
 * payload that happens to start with the magic is escaped by wrapping it with expiresAt = 0,
 * so unwrap is unambiguous for everything this app writes.
 *
 * Honest limit: expiry is enforced by an honest client. Someone holding the passphrase and
 * Spatial Key could decrypt with a modified client or by changing their clock.
 */
export const ENVELOPE_MAGIC = new Uint8Array([0x43, 0x58, 0x33, 0x54, 0x54, 0x4c, 0x00, 0x01]);
export const ENVELOPE_HEADER_BYTES = 16;

export class PayloadExpiredError extends Error {
  readonly code = 'EXPIRED';
  constructor() {
    super('Dead drop has expired');
    this.name = 'PayloadExpiredError';
  }
}

export class EnvelopeInputError extends Error {
  readonly code = 'INVALID_INPUT';
  constructor() {
    super('Invalid expiry timestamp');
    this.name = 'EnvelopeInputError';
  }
}

function startsWithMagic(bytes: Uint8Array): boolean {
  if (bytes.length < ENVELOPE_HEADER_BYTES) return false;
  for (let i = 0; i < ENVELOPE_MAGIC.length; i++) if (bytes[i] !== ENVELOPE_MAGIC[i]) return false;
  return true;
}

/**
 * Wraps `payload` when an expiry is requested, or when it would otherwise be mistaken for an
 * envelope. Returns the same array instance when no wrapping is needed.
 * @throws EnvelopeInputError if expiresAt is not a positive safe integer
 */
export function wrapPayload(payload: Uint8Array, expiresAt?: number): Uint8Array {
  if (expiresAt !== undefined && (!Number.isSafeInteger(expiresAt) || expiresAt <= 0)) {
    throw new EnvelopeInputError();
  }
  if (expiresAt === undefined && !startsWithMagic(payload)) return payload;
  const out = new Uint8Array(ENVELOPE_HEADER_BYTES + payload.length);
  out.set(ENVELOPE_MAGIC, 0);
  new DataView(out.buffer).setBigUint64(8, BigInt(expiresAt ?? 0), false);
  out.set(payload, ENVELOPE_HEADER_BYTES);
  return out;
}

export interface UnwrappedPayload {
  payload: Uint8Array;
  /** Milliseconds since the epoch, or null when there is no expiry. */
  expiresAt: number | null;
  wrapped: boolean;
}

export function unwrapPayload(plain: Uint8Array): UnwrappedPayload {
  if (!startsWithMagic(plain)) return { payload: plain, expiresAt: null, wrapped: false };
  const raw = new DataView(plain.buffer, plain.byteOffset, plain.byteLength).getBigUint64(8, false);
  const expiresAt = raw === 0n ? null : raw <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(raw) : Number.MAX_SAFE_INTEGER;
  return { payload: plain.slice(ENVELOPE_HEADER_BYTES), expiresAt, wrapped: true };
}

/** A drop is expired strictly after its timestamp. */
export function isExpired(expiresAt: number | null, now: number): boolean {
  return expiresAt !== null && now > expiresAt;
}
