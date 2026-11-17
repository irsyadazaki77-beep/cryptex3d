import { describe, expect, it } from 'vitest';
import { AdaptiveQuality } from '../../src/scene/adaptiveQuality';

const opts = { warmupFrames: 5, windowFrames: 20, maxOverRatio: 0.5 };

describe('AdaptiveQuality', () => {
  it('keeps bloom on when frames stay within budget', () => {
    const q = new AdaptiveQuality(4, opts);
    for (let i = 0; i < 100; i++) q.record(1.5, 16.7);
    expect(q.bloomEnabled).toBe(true);
  });

  it('disables bloom when most frames exceed the CPU budget', () => {
    const q = new AdaptiveQuality(4, opts);
    for (let i = 0; i < 40; i++) q.record(9, 16.7);
    expect(q.bloomEnabled).toBe(false);
  });

  it('disables bloom when the frame interval is persistently slow', () => {
    const q = new AdaptiveQuality(4, opts);
    for (let i = 0; i < 40; i++) q.record(1, 50);
    expect(q.bloomEnabled).toBe(false);
  });

  it('ignores warm-up frames and tab-resume gaps', () => {
    const q = new AdaptiveQuality(4, opts);
    for (let i = 0; i < 5; i++) q.record(50, 100);
    for (let i = 0; i < 40; i++) q.record(1, 5000);
    expect(q.bloomEnabled).toBe(true);
  });

  it('stays disabled once downgraded', () => {
    const q = new AdaptiveQuality(4, opts);
    for (let i = 0; i < 40; i++) q.record(9, 16.7);
    for (let i = 0; i < 100; i++) q.record(0.5, 16.7);
    expect(q.bloomEnabled).toBe(false);
  });
});
