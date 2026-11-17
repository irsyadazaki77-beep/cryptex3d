/**
 * Tamper tripwire: pure counting logic. Three consecutive authentication failures (wrong
 * Spatial Key or passphrase) trip it. The store then overwrites the in-memory carrier and
 * shard buffers with random bytes and the scene plays a glitch/shatter effect.
 *
 * This is a deterrent for shoulder-surfing and fumbling, not a security boundary: anyone who
 * holds a copy of the carrier file can still attack it offline, where PBKDF2 (310 000
 * iterations) and AES-GCM are the real defence. No React, no Three.js, no secrets.
 */
export const TRIPWIRE_LIMIT = 3;

export type TripReason = 'tripwire' | 'expired';

export interface TripwireState {
  /** Consecutive authentication failures on the current carrier / shard set. */
  failures: number;
  tripped: boolean;
  reason: TripReason | null;
}

export const idleTripwire = (): TripwireState => ({ failures: 0, tripped: false, reason: null });

/** AUTH_FAIL extends the streak; any other outcome (success, checksum, bad magic...) resets it. */
export function nextFailureCount(count: number, code: string | null): number {
  return code === 'AUTH_FAIL' ? Math.min(count + 1, TRIPWIRE_LIMIT) : 0;
}

export function shouldTrip(count: number): boolean {
  return count >= TRIPWIRE_LIMIT;
}
