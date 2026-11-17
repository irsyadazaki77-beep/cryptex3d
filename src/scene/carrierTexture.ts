/**
 * Carrier texture helper. LSB payloads require exact pixel values to reach the GPU:
 * no colour-space conversion, no mipmaps, nearest filtering.
 */
import * as THREE from 'three';

export function configureCarrierTexture<T extends THREE.Texture>(texture: T): T {
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Build a DataTexture from RGBA pixels (Uint8ClampedArray) without copying the data's values. */
export function createCarrierDataTexture(
  pixels: Uint8ClampedArray,
  width = 1024,
  height = 1024,
): THREE.DataTexture {
  const data = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  return configureCarrierTexture(tex);
}
