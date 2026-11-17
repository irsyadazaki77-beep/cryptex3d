import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  CARRIER_FRAGMENT_SHADER,
  NORMAL_BASE,
  NORMAL_GAIN,
  XRAY_INSIDE,
  XRAY_ONE,
  XRAY_OUTSIDE,
  XRAY_UNKNOWN,
  XRAY_ZERO,
  normalShade,
  payloadPixels,
  xrayShade,
  type Rgb,
} from '../../src/scene/carrierShade';

const texelArb = fc.tuple(
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
) as fc.Arbitrary<Rgb>;

describe('Normal View hides the LSB plane', () => {
  it('flipping any single LSB moves the colour by less than one tenth of an 8-bit display step', () => {
    fc.assert(
      fc.property(texelArb, fc.constantFrom(0, 1, 2), (texel, channel) => {
        const flipped = [...texel] as [number, number, number];
        flipped[channel] ^= 1;
        const a = normalShade(texel);
        const b = normalShade(flipped);
        const delta = Math.abs(a[channel] - b[channel]);
        expect(delta).toBeLessThan(1 / 255 / 10);
        for (const other of [0, 1, 2].filter((c) => c !== channel)) expect(a[other]).toBe(b[other]);
      }),
    );
  });

  it('is a dark obsidian plate for every possible texel', () => {
    fc.assert(
      fc.property(texelArb, (texel) => {
        const c = normalShade(texel);
        for (const v of c) {
          expect(v).toBeGreaterThan(0);
          expect(v).toBeLessThan(0.13);
        }
      }),
    );
    expect(NORMAL_BASE.every((v) => v < 0.03)).toBe(true);
    expect(NORMAL_GAIN.every((v) => v < 0.08)).toBe(true);
  });
});

describe('X-Ray View shows the LSB plane', () => {
  it('colours by bit parity: all-ones is cyan, all-zeros is magenta', () => {
    const ones = xrayShade([255, 255, 255], 0, 100);
    const zeros = xrayShade([254, 254, 254], 0, 100);
    for (let c = 0; c < 3; c++) {
      expect(ones[c]).toBeCloseTo(XRAY_ONE[c] * XRAY_INSIDE, 10);
      expect(zeros[c]).toBeCloseTo(XRAY_ZERO[c] * XRAY_INSIDE, 10);
    }
    expect(ones[2]).toBeGreaterThan(ones[0]); // cyan leans green/blue
    expect(zeros[0]).toBeGreaterThan(zeros[1]); // magenta leans red
  });

  it('depends only on the LSBs: changing the high 7 bits changes nothing', () => {
    fc.assert(
      fc.property(texelArb, texelArb, (a, b) => {
        const same = a.map((v, i) => (b[i] & 0xfe) | (v & 1)) as unknown as Rgb;
        expect(xrayShade(a, 5, 100)).toEqual(xrayShade(same, 5, 100));
      }),
    );
  });

  it('brightens the payload extent and dims everything after it', () => {
    const texel: Rgb = [255, 255, 255];
    const inside = xrayShade(texel, 99, 100);
    const outside = xrayShade(texel, 100, 100);
    expect(inside[1]).toBeCloseTo(outside[1] * (XRAY_INSIDE / XRAY_OUTSIDE));
    expect(xrayShade(texel, 5, -1)[1]).toBeCloseTo(XRAY_ONE[1] * XRAY_UNKNOWN);
  });

  it('counts payload pixels at three bits per pixel, rounding up', () => {
    expect(payloadPixels(0)).toBe(0);
    expect(payloadPixels(1)).toBe(1);
    expect(payloadPixels(3)).toBe(1);
    expect(payloadPixels(4)).toBe(2);
    expect(payloadPixels(8 * 1000)).toBe(2667);
  });
});

describe('generated GLSL stays in sync with the TypeScript model', () => {
  it('embeds the same constants', () => {
    const v3 = (c: Rgb) => `vec3(${c.map((n) => n.toFixed(4)).join(', ')})`;
    for (const c of [NORMAL_BASE, NORMAL_GAIN, XRAY_ONE, XRAY_ZERO]) {
      expect(CARRIER_FRAGMENT_SHADER).toContain(v3(c));
    }
    for (const n of [XRAY_INSIDE, XRAY_OUTSIDE, XRAY_UNKNOWN]) {
      expect(CARRIER_FRAGMENT_SHADER).toContain(n.toFixed(4));
    }
  });
});
