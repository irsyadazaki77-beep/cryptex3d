import type { P2PStatus } from '../store/types';

/** Tailwind width buckets (twelfths). Literal strings so Tailwind can detect them. */
const WIDTH_BUCKETS = [
  'w-0',
  'w-1/12',
  'w-2/12',
  'w-3/12',
  'w-4/12',
  'w-5/12',
  'w-6/12',
  'w-7/12',
  'w-8/12',
  'w-9/12',
  'w-10/12',
  'w-11/12',
  'w-full',
] as const;

/** Integer percent 0-100 from byte counts; 0 when total is not positive. */
export function progressPercent(transferred: number, total: number): number {
  if (!(total > 0) || !(transferred > 0)) return 0;
  return Math.min(100, Math.floor((transferred / total) * 100));
}

/** Maps a byte-count ratio to a Tailwind width class. Only 100% yields w-full. */
export function progressWidthClass(transferred: number, total: number): string {
  const pct = progressPercent(transferred, total);
  if (pct >= 100) return 'w-full';
  return WIDTH_BUCKETS[Math.floor((pct / 100) * 12)];
}

export type TransportMode = 'webrtc' | 'broadcast';

export const TIMEOUT_MESSAGE = 'Connection timed out';

/** Builds the store status for the current transport state. */
export function buildP2PStatus(
  mode: P2PStatus['mode'],
  connectionState: P2PStatus['connectionState'],
  transferredBytes = 0,
  totalBytes = 0,
): P2PStatus {
  return { mode, connectionState, transferredBytes, totalBytes };
}
