import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  progressPercent,
  progressWidthClass,
  buildP2PStatus,
} from '../../src/components/p2pPanelLogic';

describe('p2pPanelLogic', () => {
  it('handles zero total and completion', () => {
    expect(progressPercent(5, 0)).toBe(0);
    expect(progressWidthClass(0, 100)).toBe('w-0');
    expect(progressWidthClass(100, 100)).toBe('w-full');
    expect(progressWidthClass(50, 100)).toBe('w-6/12');
  });

  it('percent is within 0-100 and monotonic', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 0, max: 2_000_000 }),
        fc.integer({ min: 0, max: 2_000_000 }),
        (total, a, b) => {
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          const p1 = progressPercent(lo, total);
          const p2 = progressPercent(hi, total);
          return p1 >= 0 && p2 <= 100 && p1 <= p2;
        },
      ),
    );
  });

  it('builds status', () => {
    expect(buildP2PStatus('broadcast-listening', 'connected')).toEqual({
      mode: 'broadcast-listening',
      connectionState: 'connected',
      transferredBytes: 0,
      totalBytes: 0,
    });
  });
});
