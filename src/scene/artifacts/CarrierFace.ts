/**
 * CarrierFace: a plate on the Obsidian Monolith that displays the live carrier PNG.
 *
 * Normal View is an ordinary dark obsidian texture. X-Ray View (the HUD "X-Ray LSB Lens")
 * swaps the shader to the LSB bit-plane in neon cyan / magenta, with the payload extent
 * highlighted. The texture obeys the carrier rules: NoColorSpace, no mipmaps, nearest
 * filtering (see carrierTexture.ts), so nothing alters a single bit on its way to the GPU.
 *
 * The render loop only reads `sceneBridge`; it never touches React or the store. Every
 * geometry, material and texture is registered for disposal. No store imports.
 */
import * as THREE from 'three';
import type { ArtifactFactory } from '../sceneRegistry';
import { createCarrierDataTexture } from '../carrierTexture';
import {
  CARRIER_FRAGMENT_SHADER,
  CARRIER_VERTEX_SHADER,
  payloadPixels,
} from '../carrierShade';
import {
  getCarrierPreview,
  getCarrierPreviewVersion,
  getGlitchLevel,
  getXrayLens,
} from '../sceneBridge';

export const MONOLITH_NAME = 'ObsidianMonolith';
const FACE_SIZE = 0.86;
/** Front surface of the monolith slab (depth 0.5, so z = 0.25) plus a hair to avoid z-fighting. */
const FACE_Z = 0.254;
const FACE_Y = 0.55;
const PLACEHOLDER_SIZE = 64;
/** Eased transition time for the lens, in milliseconds. */
const LENS_EASE_MS = 140;

/** Seeded noise for the idle plate (visual only, nothing security-relevant). */
export function placeholderPixels(size: number = PLACEHOLDER_SIZE): Uint8ClampedArray {
  let s = 0x9e3779b9;
  const px = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < px.length; i += 4) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    px[i] = s & 0xff;
    px[i + 1] = (s >>> 8) & 0xff;
    px[i + 2] = (s >>> 16) & 0xff;
    px[i + 3] = 255;
  }
  return px;
}

export const createCarrierFace: ArtifactFactory = (ctx) => {
  const { registry, scene } = ctx;
  const monolith = scene.getObjectByName(MONOLITH_NAME);
  if (!monolith) return;

  let texture = createCarrierDataTexture(placeholderPixels(), PLACEHOLDER_SIZE, PLACEHOLDER_SIZE);
  let unregisterTexture = registry.registerDisposable(texture);

  const geometry = new THREE.PlaneGeometry(FACE_SIZE, FACE_SIZE);
  const material = new THREE.ShaderMaterial({
    vertexShader: CARRIER_VERTEX_SHADER,
    fragmentShader: CARRIER_FRAGMENT_SHADER,
    uniforms: {
      uMap: { value: texture },
      uXray: { value: 0 },
      uPayloadPixels: { value: -1 },
      uSize: { value: PLACEHOLDER_SIZE },
      uTime: { value: 0 },
      uGlitch: { value: 0 },
    },
    fog: false,
  });
  const face = new THREE.Mesh(geometry, material);
  face.name = 'carrier-face';
  face.position.set(0, FACE_Y, FACE_Z);
  monolith.add(face);
  registry.registerDisposable(geometry);
  registry.registerDisposable(material);

  const swapTexture = (next: THREE.DataTexture): void => {
    unregisterTexture();
    texture.dispose();
    texture = next;
    unregisterTexture = registry.registerDisposable(texture);
    material.uniforms.uMap.value = texture;
  };

  let seenVersion = -1;
  let lens = 0;

  const stopFrame = registry.onFrame((deltaMs, timeMs) => {
    const v = getCarrierPreviewVersion();
    if (v !== seenVersion) {
      seenVersion = v;
      const p = getCarrierPreview();
      if (p) {
        swapTexture(createCarrierDataTexture(p.pixels, p.width, p.height));
        material.uniforms.uSize.value = p.width;
        material.uniforms.uPayloadPixels.value = p.payloadBits === null ? -1 : payloadPixels(p.payloadBits);
      } else {
        swapTexture(createCarrierDataTexture(placeholderPixels(), PLACEHOLDER_SIZE, PLACEHOLDER_SIZE));
        material.uniforms.uSize.value = PLACEHOLDER_SIZE;
        material.uniforms.uPayloadPixels.value = -1;
      }
    }
    const target = getXrayLens() ? 1 : 0;
    lens += (target - lens) * (1 - Math.exp(-deltaMs / LENS_EASE_MS));
    material.uniforms.uXray.value = lens;
    material.uniforms.uTime.value = timeMs / 1000;
    material.uniforms.uGlitch.value = getGlitchLevel();
  });

  return () => {
    stopFrame();
    unregisterTexture();
    face.removeFromParent();
    texture.dispose();
    geometry.dispose();
    material.dispose();
  };
};

export default createCarrierFace;
