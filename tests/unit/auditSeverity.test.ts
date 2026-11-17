import { describe, expect, it } from 'vitest';
import { clamp01, scoreToSeverity } from '../../src/components/auditSeverity';

describe('scoreToSeverity', () => {
  it('buckets scores at 40 and 70', () => {
    expect(scoreToSeverity(0)).toBe('low');
    expect(scoreToSeverity(39)).toBe('low');
    expect(scoreToSeverity(40)).toBe('medium');
    expect(scoreToSeverity(69)).toBe('medium');
    expect(scoreToSeverity(70)).toBe('high');
    expect(scoreToSeverity(100)).toBe('high');
  });
  it('treats NaN as low', () => {
    expect(scoreToSeverity(NaN)).toBe('low');
  });
  it('clamps to unit range', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.5)).toBe(0.5);
  });
});
