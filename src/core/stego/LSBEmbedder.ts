import {
  buildBitstream,
  CarrierCapacityError,
  MAX_PAYLOAD_BYTES,
  PayloadTooLargeError,
} from './BitstreamLayout';

export { PayloadTooLargeError, CarrierCapacityError };

/**
 * Embeds `payload` (ciphertext) into the LSBs of the R, G, B channels of an RGBA buffer.
 * The input is never mutated; a new buffer is returned. Bits are written MSB-first.
 * @throws PayloadTooLargeError if payload exceeds 256 000 bytes
 * @throws CarrierCapacityError if the bitstream does not fit in the carrier
 */
export function embed(carrierBuffer: Uint8ClampedArray, payload: Uint8Array): Uint8ClampedArray {
  if (payload.byteLength > MAX_PAYLOAD_BYTES) throw new PayloadTooLargeError(payload.byteLength);

  const bits = buildBitstream(payload);
  const requiredBits = bits.byteLength * 8;
  const availableBits = Math.floor(carrierBuffer.length / 4) * 3;
  if (requiredBits > availableBits) throw new CarrierCapacityError(requiredBits, availableBits);

  const out = new Uint8ClampedArray(carrierBuffer); // copy
  let idx = 0; // channel-slot index (R,G,B only)
  for (let bitPos = 0; bitPos < requiredBits; bitPos++) {
    const bit = (bits[bitPos >> 3] >> (7 - (bitPos & 7))) & 1;
    const byteIndex = (idx / 3 | 0) * 4 + (idx % 3);
    out[byteIndex] = (out[byteIndex] & 0xfe) | bit;
    idx++;
  }
  return out;
}
