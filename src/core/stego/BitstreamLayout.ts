import { sha256 } from './sha256';

/** Cryptex3D payload magic header: "CRYPT3D\0". */
export const MAGIC: Uint8Array = new Uint8Array([0x43, 0x52, 0x59, 0x50, 0x54, 0x33, 0x44, 0x00]);
export const MAGIC_SIZE = 8;
export const LENGTH_SIZE = 4;
export const CHECKSUM_SIZE = 32;
/** Bytes preceding the ciphertext (magic + length). */
export const HEADER_SIZE = MAGIC_SIZE + LENGTH_SIZE;
/** Fixed overhead of a bitstream (header + checksum). */
export const OVERHEAD_SIZE = HEADER_SIZE + CHECKSUM_SIZE;
export const MAX_PAYLOAD_BYTES = 256_000;

export class PayloadTooLargeError extends Error {
  readonly code = 'PAYLOAD_TOO_LARGE';
  constructor(readonly byteLength: number, readonly maxBytes: number = MAX_PAYLOAD_BYTES) {
    super(`Payload of ${byteLength} bytes exceeds the ${maxBytes}-byte limit`);
    this.name = 'PayloadTooLargeError';
  }
}

export class CarrierCapacityError extends Error {
  readonly code = 'CARRIER_CAPACITY_EXCEEDED';
  constructor(readonly requiredBits: number, readonly availableBits: number) {
    super(`Bitstream needs ${requiredBits} bits but carrier holds ${availableBits}`);
    this.name = 'CarrierCapacityError';
  }
}

export class BadMagicError extends Error {
  readonly code = 'BAD_MAGIC';
  constructor() {
    super('Carrier does not contain a Cryptex3D payload');
    this.name = 'BadMagicError';
  }
}

export class ChecksumFailError extends Error {
  readonly code = 'CHECKSUM_FAIL';
  constructor() {
    super('Payload checksum verification failed');
    this.name = 'ChecksumFailError';
  }
}

/** Total bitstream length in bytes for a ciphertext of `payloadBytes`. */
export function bitstreamSize(payloadBytes: number): number {
  return OVERHEAD_SIZE + payloadBytes;
}

/** Builds magic + BE uint32 length + ciphertext + SHA-256(magic+length+ciphertext). */
export function buildBitstream(payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(bitstreamSize(payload.byteLength));
  out.set(MAGIC, 0);
  new DataView(out.buffer).setUint32(MAGIC_SIZE, payload.byteLength, false);
  out.set(payload, HEADER_SIZE);
  const body = out.subarray(0, HEADER_SIZE + payload.byteLength);
  out.set(sha256(body), HEADER_SIZE + payload.byteLength);
  return out;
}

/** Returns true if `bytes` begins with the Cryptex3D magic header. */
export function hasValidMagic(bytes: Uint8Array): boolean {
  if (bytes.byteLength < MAGIC_SIZE) return false;
  for (let i = 0; i < MAGIC_SIZE; i++) if (bytes[i] !== MAGIC[i]) return false;
  return true;
}

/** Reads the payload length field; call after verifying magic. Requires >= HEADER_SIZE bytes. */
export function readPayloadLength(bytes: Uint8Array): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(MAGIC_SIZE, false);
}

/**
 * Parses a full bitstream, verifying magic then checksum. Returns the ciphertext.
 * @throws BadMagicError, ChecksumFailError
 */
export function parseBitstream(bytes: Uint8Array): Uint8Array {
  if (bytes.byteLength < HEADER_SIZE || !hasValidMagic(bytes)) throw new BadMagicError();
  const len = readPayloadLength(bytes);
  const end = HEADER_SIZE + len;
  if (len > MAX_PAYLOAD_BYTES || bytes.byteLength < end + CHECKSUM_SIZE) throw new ChecksumFailError();
  const expected = sha256(bytes.subarray(0, end));
  const actual = bytes.subarray(end, end + CHECKSUM_SIZE);
  let diff = 0;
  for (let i = 0; i < CHECKSUM_SIZE; i++) diff |= expected[i] ^ actual[i];
  if (diff !== 0) throw new ChecksumFailError();
  return bytes.slice(HEADER_SIZE, end);
}
