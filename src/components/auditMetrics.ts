/** Pure helpers behind the steganalysis gauge and breakdown bars in AuditPanel. */

/** RGB LSB capacity of the 1024x1024 carrier in bytes (3 bits per pixel). */
export const CARRIER_CAPACITY_BYTES = Math.floor((1024 * 1024 * 3) / 8);
/** Estimated embedding rate above which LSB-pair analysis starts flagging the carrier. */
export const SAFE_DENSITY = 0.15;
export const HIGH_DENSITY = 0.5;

export type Tone = 'good' | 'warn' | 'bad';

/** Undetectability meter value: 100 = indistinguishable from a natural image. */
export function undetectability(detectabilityScore: number): number {
  if (!Number.isFinite(detectabilityScore)) return 0;
  return Math.round(100 - Math.min(100, Math.max(0, detectabilityScore)));
}

/** Shannon entropy of the LSB plane (bits/byte): near 8 looks like random ciphertext. */
export function entropyTone(bitsPerByte: number): Tone {
  if (bitsPerByte >= 7.9) return 'bad';
  if (bitsPerByte >= 7.0) return 'warn';
  return 'good';
}

/** Chi-square p-value: failing to reject uniformity is consistent with embedded ciphertext. */
export function chiSquareTone(pValue: number): Tone {
  return pValue >= 0.05 ? 'warn' : 'good';
}

/** RS-estimated embedding rate in [0, 1]. */
export function pairTone(rate: number): Tone {
  if (rate >= HIGH_DENSITY) return 'bad';
  if (rate >= SAFE_DENSITY) return 'warn';
  return 'good';
}

export const TONE_FILL_CLASS: Record<Tone, string> = {
  good: 'fill-emerald-400',
  warn: 'fill-amber-400',
  bad: 'fill-rose-400',
};

export interface DensityAdvice {
  tone: Tone;
  message: string;
}

function clampRate(rate: number): number {
  return Number.isFinite(rate) ? Math.min(1, Math.max(0, rate)) : 0;
}

/** Estimated share of LSB capacity in use and the matching byte count. */
export function payloadDensity(rate: number): { percent: number; estimatedBytes: number } {
  const r = clampRate(rate);
  return { percent: Math.round(r * 100), estimatedBytes: Math.round(r * CARRIER_CAPACITY_BYTES) };
}

/** Actionable payload-density guidance; always returns a message. */
export function densityAdvice(rate: number): DensityAdvice {
  const { percent, estimatedBytes } = payloadDensity(rate);
  const safeKb = Math.floor((SAFE_DENSITY * CARRIER_CAPACITY_BYTES) / 1000);
  const usedKb = (estimatedBytes / 1000).toFixed(1);
  const r = clampRate(rate);
  if (r >= HIGH_DENSITY) {
    return {
      tone: 'bad',
      message: `Payload density is about ${percent}% of LSB capacity (~${usedKb} KB). Cut the payload to under ~${safeKb} KB or compress it before embedding.`,
    };
  }
  if (r >= SAFE_DENSITY) {
    return {
      tone: 'warn',
      message: `Payload density is about ${percent}% of LSB capacity (~${usedKb} KB). Staying under ~${safeKb} KB keeps pair analysis quiet.`,
    };
  }
  return {
    tone: 'good',
    message: `Payload density is low (about ${percent}% of LSB capacity). No change needed.`,
  };
}
