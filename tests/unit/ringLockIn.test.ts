import { describe, expect, it } from 'vitest';
import { decayPulse, isRingAligned } from '../../src/scene/artifacts/CryptexRing';

describe('ring lock-in helpers', () => {
  it('detects an aligned ring', () => {
    expect(isRingAligned([3, 3, 3, 3, 3, 3, 3, 3])).toBe(true);
    expect(isRingAligned([0, 0, 0, 0, 0, 0, 0, 1])).toBe(false);
    expect(isRingAligned([])).toBe(false);
  });

  it('decays a pulse linearly and clamps at zero', () => {
    expect(decayPulse(1, 350, 700)).toBeCloseTo(0.5);
    expect(decayPulse(0.2, 700, 700)).toBe(0);
    expect(decayPulse(0, 16, 700)).toBe(0);
  });
});
