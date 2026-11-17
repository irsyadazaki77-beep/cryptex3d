import { byteHistogram, packLSBPlane } from './lsbPlane';

/** Shannon entropy (bits/byte) of a 256-bucket histogram. Range [0, 8]. */
export function entropyFromHistogram(hist: ArrayLike<number>): number {
  let total = 0;
  for (let i = 0; i < 256; i++) total += hist[i] ?? 0;
  if (total === 0) return 0;
  let h = 0;
  for (let i = 0; i < 256; i++) {
    const c = hist[i] ?? 0;
    if (c > 0) {
      const p = c / total;
      h -= p * Math.log2(p);
    }
  }
  return Math.min(8, Math.max(0, h));
}

/**
 * Shannon entropy in bits/byte of the carrier's R,G,B LSB plane.
 * The LSBs are packed MSB-first into bytes (R,G,B per pixel, alpha skipped,
 * see lsbPlane.ts). 8.0 means a perfectly uniform byte distribution.
 */
export function shannonEntropy(rgba: Uint8ClampedArray): number {
  return entropyFromHistogram(byteHistogram(packLSBPlane(rgba)));
}
