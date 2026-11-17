/**
 * Default carrier generator: 1024x1024 opaque RGBA noise PNG.
 * Randomness comes from crypto.getRandomValues only. No React/Three imports.
 */
export const DEFAULT_CARRIER_SIZE = 1024;

/** getRandomValues accepts at most 65 536 bytes per call. */
const RANDOM_CHUNK = 65536;

/** Returns raw RGBA noise with alpha forced to 255 (opaque, so no premultiply loss). */
export function generateNoisePixels(size: number = DEFAULT_CARRIER_SIZE): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let off = 0; off < pixels.length; off += RANDOM_CHUNK) {
    crypto.getRandomValues(pixels.subarray(off, Math.min(off + RANDOM_CHUNK, pixels.length)));
  }
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
  return pixels;
}

/** Generates a lossless 1024x1024 RGBA noise PNG. */
export async function generateCarrierPNG(): Promise<Uint8Array> {
  const size = DEFAULT_CARRIER_SIZE;
  // Copy into a fresh ArrayBuffer-backed array to satisfy ImageData typing.
  const data = new Uint8ClampedArray(generateNoisePixels(size));
  const image = new ImageData(data, size, size, { colorSpace: 'srgb' });

  let blob: Blob | null;
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CARRIER_GENERATION_FAILED');
    ctx.putImageData(image, 0, 0);
    blob = await canvas.convertToBlob({ type: 'image/png' });
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CARRIER_GENERATION_FAILED');
    ctx.putImageData(image, 0, 0);
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  }
  if (!blob) throw new Error('CARRIER_GENERATION_FAILED');
  return new Uint8Array(await blob.arrayBuffer());
}
