import type { AuditReport } from '../../store/types';
import type { HeuristicResult } from './HeuristicScorer';

export const MAX_WARNINGS = 10;
export const MAX_WARNING_CHARS = 200;
export const MAX_RECOMMENDATION_CHARS = 500;

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '\u2026';
}

function buildWarnings(r: HeuristicResult): string[] {
  const w: string[] = [];
  if (r.shannonEntropy >= 7.9) {
    w.push(`LSB plane entropy is ${r.shannonEntropy.toFixed(3)} bits/byte, close to random (8.0). Natural images are usually lower.`);
  } else if (r.shannonEntropy >= 7.0) {
    w.push(`LSB plane entropy is ${r.shannonEntropy.toFixed(3)} bits/byte, higher than typical for a natural image.`);
  }
  if (r.chiSquarePValue >= 0.05) {
    w.push(`Chi-square test cannot reject a uniform LSB distribution (p = ${r.chiSquarePValue.toFixed(4)}), which is consistent with embedded ciphertext.`);
  }
  if (r.lsbPairAnomaly >= 0.5) {
    w.push(`RS analysis estimates about ${Math.round(r.lsbPairAnomaly * 100)}% of samples carry LSB-embedded data.`);
  } else if (r.lsbPairAnomaly >= 0.15) {
    w.push(`RS analysis shows a moderate LSB-pair anomaly (estimated embedding rate ${Math.round(r.lsbPairAnomaly * 100)}%).`);
  }
  if (r.advancedUsed) w.push('Advanced model output was included in this score.');
  return w.slice(0, MAX_WARNINGS).map((s) => truncate(s, MAX_WARNING_CHARS));
}

function buildRecommendation(score: number): string {
  if (score < 25) return 'Low detectability. The carrier LSB statistics are close to those of a natural image. No action needed.';
  if (score < 60) return 'Moderate detectability. Use a smaller payload or a carrier with more natural noise to lower the anomaly. This audit is advisory only.';
  return 'High detectability. Statistical tests flag this carrier as likely containing hidden data. Reduce the payload size or use a noisier, more detailed carrier image. This audit is advisory only.';
}

/** Assembles the AuditReport posted to the main thread. Score is clamped to [0, 100]. */
export function buildAuditReport(r: HeuristicResult): AuditReport {
  const score = Number.isFinite(r.score) ? Math.min(100, Math.max(0, Math.round(r.score * 100) / 100)) : 0;
  return {
    score,
    warnings: buildWarnings(r),
    recommendation: truncate(buildRecommendation(score), MAX_RECOMMENDATION_CHARS),
    shannonEntropy: r.shannonEntropy,
    chiSquarePValue: r.chiSquarePValue,
    lsbPairAnomaly: Number.isFinite(r.lsbPairAnomaly) ? Math.min(1, Math.max(0, r.lsbPairAnomaly)) : 0,
  };
}
