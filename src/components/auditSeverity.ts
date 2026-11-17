export type AuditSeverity = 'low' | 'medium' | 'high';

/** Higher score = more detectable. 0-39 low, 40-69 medium, 70-100 high. */
export function scoreToSeverity(score: number): AuditSeverity {
  if (!Number.isFinite(score) || score < 40) return 'low';
  if (score < 70) return 'medium';
  return 'high';
}

export const SEVERITY_TEXT_CLASS: Record<AuditSeverity, string> = {
  low: 'text-emerald-400',
  medium: 'text-amber-400',
  high: 'text-rose-400',
};

export const SEVERITY_FILL_CLASS: Record<AuditSeverity, string> = {
  low: 'fill-emerald-400',
  medium: 'fill-amber-400',
  high: 'fill-rose-400',
};

/** Clamp to [0,1]; non-finite becomes 0. */
export function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}
