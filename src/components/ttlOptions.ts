/** Self-destruct choices for the Encrypt panel. Pure data; no React. */
export interface TtlOption {
  id: string;
  label: string;
  /** Milliseconds from encryption time, or undefined for no expiry. */
  ms: number | undefined;
}

export const TTL_OPTIONS: readonly TtlOption[] = [
  { id: 'none', label: 'Never expires', ms: undefined },
  { id: '1m', label: 'Expires in 1 minute', ms: 60_000 },
  { id: '1h', label: 'Expires in 1 hour', ms: 3_600_000 },
  { id: '24h', label: 'Expires in 24 hours', ms: 86_400_000 },
  { id: '7d', label: 'Expires in 7 days', ms: 604_800_000 },
];

export function ttlFor(id: string): number | undefined {
  return TTL_OPTIONS.find((o) => o.id === id)?.ms;
}

/** Local, locale-aware timestamp for display. */
export function formatExpiry(epochMs: number): string {
  return new Date(epochMs).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
