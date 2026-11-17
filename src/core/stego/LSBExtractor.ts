import {
  BadMagicError,
  ChecksumFailError,
  HEADER_SIZE,
  MAX_PAYLOAD_BYTES,
  bitstreamSize,
  hasValidMagic,
  parseBitstream,
  readPayloadLength,
} from './BitstreamLayout';

export { BadMagicError, ChecksumFailError };

/** Reads `byteCount` bytes MSB-first from the R,G,B LSBs of `carrier` (alpha skipped). */
function readBytes(carrier: Uint8ClampedArray, byteCount: number): Uint8Array {
  const out = new Uint8Array(byteCount);
  const totalBits = byteCount * 8;
  for (let bitPos = 0; bitPos < totalBits; bitPos++) {
    const slot = bitPos; // channel-slot index over R,G,B only
    const byteIndex = Math.floor(slot / 3) * 4 + (slot % 3);
    out[bitPos >> 3] |= (carrier[byteIndex] & 1) << (7 - (bitPos & 7));
  }
  return out;
}

/**
 * Extracts and verifies the ciphertext embedded in an RGBA carrier buffer.
 * Ciphertext is returned only after magic and SHA-256 checksum both verify.
 * @throws BadMagicError if the carrier has no Cryptex3D header (or is too small to hold one)
 * @throws ChecksumFailError if the length field is invalid or the checksum does not match
 */
export function extract(carrierBuffer: Uint8ClampedArray): Uint8Array {
  const availableBits = Math.floor(carrierBuffer.length / 4) * 3;
  if (availableBits < HEADER_SIZE * 8) throw new BadMagicError();

  const header = readBytes(carrierBuffer, HEADER_SIZE);
  if (!hasValidMagic(header)) throw new BadMagicError();

  const length = readPayloadLength(header);
  if (length > MAX_PAYLOAD_BYTES || bitstreamSize(length) * 8 > availableBits) {
    throw new ChecksumFailError();
  }

  const bitstream = readBytes(carrierBuffer, bitstreamSize(length));
  return parseBitstream(bitstream);
}

/**
 * Number of carrier LSB bits occupied by a Cryptex3D payload (magic + length + payload + checksum),
 * or null when the carrier holds no valid header. Reads the 12-byte header only; it does not
 * verify the checksum or decrypt anything. Used to draw the X-Ray payload extent.
 */
export function readPayloadExtentBits(carrierBuffer: Uint8ClampedArray): number | null {
  const availableBits = Math.floor(carrierBuffer.length / 4) * 3;
  if (availableBits < HEADER_SIZE * 8) return null;
  const header = readBytes(carrierBuffer, HEADER_SIZE);
  if (!hasValidMagic(header)) return null;
  const length = readPayloadLength(header);
  if (length > MAX_PAYLOAD_BYTES) return null;
  const bits = bitstreamSize(length) * 8;
  return bits <= availableBits ? bits : null;
}