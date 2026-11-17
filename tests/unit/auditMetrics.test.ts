import { describe, expect, it } from 'vitest';
import {
  CARRIER_CAPACITY_BYTES,
  chiSquareTone,
  densityAdvice,
  entropyTone,
  pairTone,
  payloadDensity,
  undetectability,
} from '../../src/components/auditMetrics';

describe('auditMetrics', () => {
  it('inverts and clamps the detectability score', () => {
    expect(undetectability(0)).toBe(100);
    expect(undetectability(37.4)).toBe(63);
    expect(undetectability(250)).toBe(0);
    expect(undetectability(-5)).toBe(100);
    expect(undetectability(NaN)).toBe(0);
  });

  it('classifies metric tones', () => {
    expect(entropyTone(7.95)).toBe('bad');
    expect(entropyTone(7.2)).toBe('warn');
    expect(entropyTone(5)).toBe('good');
    expect(chiSquareTone(0.4)).toBe('warn');
    expect(chiSquareTone(0.001)).toBe('good');
    expect(pairTone(0.6)).toBe('bad');
    expect(pairTone(0.2)).toBe('warn');
    expect(pairTone(0.01)).toBe('good');
  });

  it('computes payload density against the RGB LSB capacity', () => {
    expect(CARRIER_CAPACITY_BYTES).toBe(393_216);
    expect(payloadDensity(0.5)).toEqual({ percent: 50, estimatedBytes: 196_608 });
    expect(payloadDensity(NaN).percent).toBe(0);
  });

  it('gives actionable advice that scales with density', () => {
    expect(densityAdvice(0.7).tone).toBe('bad');
    expect(densityAdvice(0.7).message).toMatch(/Cut the payload/);
    expect(densityAdvice(0.2).tone).toBe('warn');
    expect(densityAdvice(0.02).tone).toBe('good');
  });
});
