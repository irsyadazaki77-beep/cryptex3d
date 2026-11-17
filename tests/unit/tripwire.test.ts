import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  TRIPWIRE_LIMIT,
  idleTripwire,
  nextFailureCount,
  shouldTrip,
} from '../../src/store/tripwire';
import { overwriteWithRandom, randomBytes } from '../../src/core/shared/secureWipe';

describe('tripwire counting', () => {
  it('trips on exactly three consecutive AUTH_FAILs', () => {
    expect(TRIPWIRE_LIMIT).toBe(3);
    let n = 0;
    n = nextFailureCount(n, 'AUTH_FAIL');
    expect(shouldTrip(n)).toBe(false);
    n = nextFailureCount(n, 'AUTH_FAIL');
    expect(shouldTrip(n)).toBe(false);
    n = nextFailureCount(n, 'AUTH_FAIL');
    expect(shouldTrip(n)).toBe(true);
  });

  it('resets on success or on any other error', () => {
    expect(nextFailureCount(2, null)).toBe(0);
    expect(nextFailureCount(2, 'CHECKSUM_FAIL')).toBe(0);
    expect(nextFailureCount(2, 'BAD_MAGIC')).toBe(0);
    expect(nextFailureCount(2, 'INSUFFICIENT_SHARDS')).toBe(0);
  });

  it('never exceeds the limit and only trips after an unbroken AUTH_FAIL streak (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom('AUTH_FAIL', 'CHECKSUM_FAIL', null)), (codes) => {
        let n = 0;
        let streak = 0;
        for (const c of codes) {
          n = nextFailureCount(n, c);
          streak = c === 'AUTH_FAIL' ? streak + 1 : 0;
          expect(n).toBe(Math.min(streak, TRIPWIRE_LIMIT));
          expect(shouldTrip(n)).toBe(streak >= TRIPWIRE_LIMIT);
        }
      }),
    );
  });

  it('starts idle', () => {
    expect(idleTripwire()).toEqual({ failures: 0, tripped: false, reason: null });
  });
});

describe('secure wipe', () => {
  it('overwrites a buffer in place with different bytes of the same length', () => {
    const buf = new Uint8Array(4096).fill(0xab);
    const same = buf;
    overwriteWithRandom(buf);
    expect(buf).toBe(same);
    expect(buf.length).toBe(4096);
    // 4096 random bytes all equal to 0xab has probability 256^-4096.
    expect(buf.some((b) => b !== 0xab)).toBe(true);
  });

  it('handles buffers larger than the 65 536-byte getRandomValues quota', () => {
    const buf = new Uint8Array(65_536 * 2 + 123).fill(7);
    overwriteWithRandom(buf);
    // Every 64 KiB chunk, including the short tail, must have been touched.
    for (const [from, to] of [
      [0, 65_536],
      [65_536, 131_072],
      [131_072, buf.length],
    ] as const) {
      expect(buf.subarray(from, to).some((b) => b !== 7)).toBe(true);
    }
  });

  it('only touches the view it is given', () => {
    const backing = new Uint8Array(100).fill(1);
    overwriteWithRandom(backing.subarray(40, 60));
    expect(backing.subarray(0, 40).every((b) => b === 1)).toBe(true);
    expect(backing.subarray(60).every((b) => b === 1)).toBe(true);
    expect(backing.subarray(40, 60).some((b) => b !== 1)).toBe(true);
  });

  it('works on Uint8ClampedArray pixel buffers', () => {
    const px = new Uint8ClampedArray(512).fill(255);
    overwriteWithRandom(px);
    expect(px.some((b) => b !== 255)).toBe(true);
  });

  it('randomBytes returns fresh, different content', () => {
    const a = randomBytes(64);
    const b = randomBytes(64);
    expect(a).toHaveLength(64);
    expect(a).not.toEqual(b);
  });
});
