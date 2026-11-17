/**
 * Shared shading constants and a TypeScript mirror of the CarrierFace fragment shader.
 *
 * Normal View maps the carrier through a heavy darkening so it reads as an ordinary dark
 * obsidian texture; a flipped LSB changes a texel by 1/255, which Normal View attenuates to
 * well under one 8-bit display step. X-Ray View discards everything but the LSB plane and
 * paints it neon: cyan where the bits are 1, magenta where they are 0, bright inside the
 * payload extent and dim outside it.
 *
 * The GLSL in CarrierFace.ts is generated from these constants, and tests exercise this
 * mirror, so the "looks identical" claim is checked rather than asserted.
 */
export type Rgb = readonly [number, number, number];

/** Obsidian base colour of Normal View. */
export const NORMAL_BASE: Rgb = [0.012, 0.014, 0.026];
/** How much of the carrier texel leaks into Normal View (per channel). */
export const NORMAL_GAIN: Rgb = [0.04, 0.046, 0.075];
export const XRAY_ONE: Rgb = [0.1, 1.5, 1.7]; // cyan, HDR so bloom picks it up
export const XRAY_ZERO: Rgb = [1.6, 0.12, 1.2]; // magenta
/** Brightness inside / outside the payload extent; and when no payload extent is known. */
export const XRAY_INSIDE = 1.0;
export const XRAY_OUTSIDE = 0.16;
export const XRAY_UNKNOWN = 0.55;

/** Pixels a payload of `bits` LSB bits occupies (3 bits per pixel, R,G,B only). */
export function payloadPixels(bits: number): number {
  return Math.ceil(bits / 3);
}

/** Normal View colour for an 8-bit texel. */
export function normalShade(texel: Rgb): Rgb {
  return [
    NORMAL_BASE[0] + (texel[0] / 255) * NORMAL_GAIN[0],
    NORMAL_BASE[1] + (texel[1] / 255) * NORMAL_GAIN[1],
    NORMAL_BASE[2] + (texel[2] / 255) * NORMAL_GAIN[2],
  ];
}

/**
 * X-Ray colour for an 8-bit texel at raster index `index`. `extentPixels` is the payload extent
 * in pixels, or a negative number when unknown.
 */
export function xrayShade(texel: Rgb, index: number, extentPixels: number): Rgb {
  const ones = ((texel[0] & 1) + (texel[1] & 1) + (texel[2] & 1)) / 3;
  const level = extentPixels < 0 ? XRAY_UNKNOWN : index < extentPixels ? XRAY_INSIDE : XRAY_OUTSIDE;
  const mix = (a: number, b: number): number => (a + (b - a) * ones) * level;
  return [mix(XRAY_ZERO[0], XRAY_ONE[0]), mix(XRAY_ZERO[1], XRAY_ONE[1]), mix(XRAY_ZERO[2], XRAY_ONE[2])];
}

const v3 = (c: Rgb): string => `vec3(${c.map((n) => n.toFixed(4)).join(', ')})`;

export const CARRIER_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const CARRIER_FRAGMENT_SHADER = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform float uXray;
uniform float uPayloadPixels;
uniform float uSize;
uniform float uTime;
uniform float uGlitch;
varying vec2 vUv;

void main() {
  // Row 0 of the pixel data is the top of the face.
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  if (uGlitch > 0.0) {
    float band = floor(uv.y * 24.0);
    float n = fract(sin(band * 91.7 + floor(uTime * 24.0) * 12.9) * 43758.5453);
    uv.x = fract(uv.x + (n - 0.5) * 0.35 * uGlitch * step(0.55, n));
  }
  vec3 texel = texture2D(uMap, uv).rgb;
  vec3 q = floor(texel * 255.0 + 0.5);
  vec3 bits = mod(q, 2.0);

  vec3 normalColor = ${v3(NORMAL_BASE)} + texel * ${v3(NORMAL_GAIN)};

  float ones = (bits.r + bits.g + bits.b) / 3.0;
  vec3 neon = mix(${v3(XRAY_ZERO)}, ${v3(XRAY_ONE)}, ones);
  float index = floor(uv.y * uSize) * uSize + floor(uv.x * uSize);
  float level = uPayloadPixels < 0.0 ? ${XRAY_UNKNOWN.toFixed(4)} : (index < uPayloadPixels ? ${XRAY_INSIDE.toFixed(4)} : ${XRAY_OUTSIDE.toFixed(4)});
  vec3 xrayColor = neon * level;

  vec3 color = mix(normalColor, xrayColor, uXray);
  if (uGlitch > 0.0) color += vec3(0.5, 0.02, 0.05) * uGlitch * step(0.97, fract(sin(dot(uv, vec2(12.9898, 78.233)) + uTime) * 43758.5453));
  gl_FragColor = vec4(color, 1.0);
}
`;
