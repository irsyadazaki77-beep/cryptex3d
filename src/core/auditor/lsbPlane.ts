/**
 * LSB-plane extraction shared by the auditor analyzers.
 *
 * Packing definition: for each RGBA pixel in raster order, the LSBs of R, G, B
 * (alpha is skipped) are appended to a bit stream. Bits are packed into bytes
 * MSB-first (first bit -> bit 7 of byte 0). Trailing bits that do not fill a
 * whole byte are discarded. This matches the bit order used by LSBEmbedder.
 */

/** Number of colour samples (R,G,B) in an RGBA buffer. */
export function colorSampleCount(rgba: Uint8ClampedArray): number {
  return Math.floor(rgba.length / 4) * 3;
}

/** Returns the R,G,B sample values only (alpha dropped), in raster order. */
export function extractRGBSamples(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const n = colorSampleCount(rgba);
  const out = new Uint8ClampedArray(n);
  let j = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    out[j++] = rgba[i]!;
    out[j++] = rgba[i + 1]!;
    out[j++] = rgba[i + 2]!;
  }
  return out;
}

/** Packs the R,G,B LSB plane into bytes (MSB-first). */
export function packLSBPlane(rgba: Uint8ClampedArray): Uint8Array {
  const bitCount = colorSampleCount(rgba);
  const out = new Uint8Array(Math.floor(bitCount / 8));
  let bitIndex = 0;
  const totalBits = out.length * 8;
  for (let i = 0; i + 3 < rgba.length && bitIndex < totalBits; i += 4) {
    for (let c = 0; c < 3 && bitIndex < totalBits; c++) {
      const bit = rgba[i + c]! & 1;
      out[bitIndex >> 3]! |= bit << (7 - (bitIndex & 7));
      bitIndex++;
    }
  }
  return out;
}

/** 256-bucket frequency histogram of a byte array. */
export function byteHistogram(bytes: Uint8Array): Uint32Array {
  const hist = new Uint32Array(256);
  for (let i = 0; i < bytes.length; i++) hist[bytes[i]!]!++;
  return hist;
}
