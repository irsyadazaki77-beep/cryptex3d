import { describe, it, expect } from 'vitest';
import { chiSquareCDF, chiSquareTest } from '../../src/core/auditor/ChiSquareTest';
import { shannonEntropy } from '../../src/core/auditor/ShannonEntropyCalc';
import { analyzeLSBPairs } from '../../src/core/auditor/LSBPairAnalyzer';

function carrier(fn: (i: number) => number, pixels = 65536): Uint8ClampedArray {
  const b = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < b.length; i++) b[i] = i % 4 === 3 ? 255 : fn(i);
  return b;
}
function lcgBits(seed: number) {
  let s = seed >>> 0; // mulberry32
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) & 1;
  };
}

describe('chi-square CDF', () => {
  it('matches known values', () => {
    expect(chiSquareCDF(3.841458820694124, 1)).toBeCloseTo(0.95, 6);
    expect(chiSquareCDF(293.2478, 255)).toBeCloseTo(0.95, 3);
  });
});

describe('LSB-plane analyzers', () => {
  const rnd = lcgBits(42);
  const random = carrier(() => 128 | rnd());
  const flat = carrier(() => 128);

  it('uniform LSBs give high entropy and non-tiny p-value', () => {
    expect(shannonEntropy(random)).toBeGreaterThan(7.9);
    expect(chiSquareTest(random).pValue).toBeGreaterThan(0.001);
  });
  it('constant LSBs give zero entropy and p ~ 0', () => {
    expect(shannonEntropy(flat)).toBe(0);
    expect(chiSquareTest(flat).pValue).toBeLessThan(1e-6);
  });
  it('RS score stays within [0,1]', () => {
    const r = analyzeLSBPairs(random);
    expect(r.anomalyScore).toBeGreaterThanOrEqual(0);
    expect(r.anomalyScore).toBeLessThanOrEqual(1);
  });
});

