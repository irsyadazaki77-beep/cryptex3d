/**
 * Stateless PNG -> raw RGBA decode helper for worker pipelines.
 * No React/Three imports. Each worker imports its own copy; no state is shared.
 */
export const CARRIER_SIZE = 1024;

export class InvalidCarrierError extends Error {
  readonly code = 'INVALID_INPUT';
}

/** Decodes PNG bytes to raw RGBA without color-space conversion or alpha premultiplication. */
export async function decodePNG(png: Uint8Array): Promise<Uint8ClampedArray> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([png as BlobPart], { type: 'image/png' }), {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    });
  } catch {
    throw new InvalidCarrierError();
  }
  try {
    if (bitmap.width !== CARRIER_SIZE || bitmap.height !== CARRIER_SIZE) throw new InvalidCarrierError();
    const canvas = new OffscreenCanvas(CARRIER_SIZE, CARRIER_SIZE);
    const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
    if (!ctx) throw new InvalidCarrierError();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, CARRIER_SIZE, CARRIER_SIZE, { colorSpace: 'srgb' }).data;
  } finally {
    bitmap.close();
  }
}
