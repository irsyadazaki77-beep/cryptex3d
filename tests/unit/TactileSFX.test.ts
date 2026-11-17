import { describe, expect, it } from 'vitest';
import { AudioEngine } from '../../src/core/audio/AudioEngine';
import {
  RING_SEGMENT_ROTATED_EVENT_NAME,
  SEGMENT_COUNT,
  SEGMENT_FREQUENCIES,
  playClick,
  segmentFrequency,
  subscribeRingClicks,
} from '../../src/core/audio/TactileSFX';
import { attenuationForDistance } from '../../src/core/audio/SpatialMixer';

describe('TactileSFX', () => {
  it('maps 10 positions to strictly increasing frequencies', () => {
    expect(SEGMENT_FREQUENCIES).toHaveLength(SEGMENT_COUNT);
    for (let i = 1; i < SEGMENT_COUNT; i++) {
      expect(segmentFrequency(i)).toBeGreaterThan(segmentFrequency(i - 1));
    }
  });

  it('playClick is a silent no-op without audio', () => {
    expect(() => playClick(3, new AudioEngine())).not.toThrow();
  });

  it('subscribes to ring-segment-rotated and unsubscribes', () => {
    const target = new EventTarget();
    const unsub = subscribeRingClicks(target, new AudioEngine());
    expect(() =>
      target.dispatchEvent(
        new CustomEvent(RING_SEGMENT_ROTATED_EVENT_NAME, { detail: { index: 1, position: 4 } }),
      ),
    ).not.toThrow();
    unsub();
  });
});

describe('SpatialMixer attenuation', () => {
  it('decreases monotonically with distance', () => {
    expect(attenuationForDistance(0)).toBe(1);
    expect(attenuationForDistance(5)).toBeLessThan(attenuationForDistance(1));
    expect(attenuationForDistance(100)).toBeGreaterThan(0);
  });
});
