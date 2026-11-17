import { extractRGBSamples } from './lsbPlane';

export interface RSResult {
  /** Regular / singular group fractions for mask M = [0,1,1,0] and its negation, on the carrier as-is. */
  rm: number;
  sm: number;
  rNegM: number;
  sNegM: number;
  /** Same fractions after flipping every LSB. */
  rmFlipped: number;
  smFlipped: number;
  rNegMFlipped: number;
  sNegMFlipped: number;
  /** Estimated fraction of samples carrying LSB-embedded data (Fridrich et al. RS estimator), clamped to [0, 1]. */
  estimatedRate: number;
  /** Anomaly score in [0, 1]; 0 = looks like a clean image, 1 = fully LSB-saturated. */
  anomalyScore: number;
}

const GROUP = 4;
const MASK = [0, 1, 1, 0];

function flipPos(x: number): number {
  return x ^ 1; // 0<->1, 2<->3, ...
}
function flipNeg(x: number): number {
  return (((x + 1) ^ 1) - 1); // -1<->0, 1<->2, ...
}

function smoothness(g: number[]): number {
  let s = 0;
  for (let i = 0; i < g.length - 1; i++) s += Math.abs(g[i + 1]! - g[i]!);
  return s;
}

interface Counts { r: number; s: number; rn: number; sn: number; groups: number }

function countGroups(samples: Uint8ClampedArray, flipAll: boolean): Counts {
  const c: Counts = { r: 0, s: 0, rn: 0, sn: 0, groups: 0 };
  const g = new Array<number>(GROUP);
  const gm = new Array<number>(GROUP);
  const gn = new Array<number>(GROUP);
  for (let i = 0; i + GROUP <= samples.length; i += GROUP) {
    for (let k = 0; k < GROUP; k++) {
      const v = samples[i + k]!;
      g[k] = flipAll ? v ^ 1 : v;
    }
    const f0 = smoothness(g);
    for (let k = 0; k < GROUP; k++) {
      gm[k] = MASK[k] === 1 ? flipPos(g[k]!) : g[k]!;
      gn[k] = MASK[k] === 1 ? flipNeg(g[k]!) : g[k]!;
    }
    const fm = smoothness(gm);
    const fn = smoothness(gn);
    if (fm > f0) c.r++; else if (fm < f0) c.s++;
    if (fn > f0) c.rn++; else if (fn < f0) c.sn++;
    c.groups++;
  }
  return c;
}

/** Smaller-magnitude root of a x^2 + b x + c = 0 (falls back to linear / 0 if degenerate). */
function solveSmallRoot(a: number, b: number, c: number): number {
  if (Math.abs(a) < 1e-12) return Math.abs(b) < 1e-12 ? 0 : -c / b;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -b / (2 * a);
  const sq = Math.sqrt(disc);
  const r1 = (-b + sq) / (2 * a);
  const r2 = (-b - sq) / (2 * a);
  return Math.abs(r1) < Math.abs(r2) ? r1 : r2;
}

/**
 * RS steganalysis on the carrier's R,G,B samples (alpha dropped). Samples are
 * grouped into runs of 4 consecutive values in raster R,G,B order; the
 * discrimination function is the sum of absolute neighbour differences, and the
 * flipping F1 (LSB swap) / F-1 (shifted LSB swap) is applied through mask [0,1,1,0].
 * The only pixel information used is the effect of LSB flipping on group
 * smoothness; no full-channel statistics are computed.
 */
export function analyzeLSBPairs(rgba: Uint8ClampedArray): RSResult {
  const samples = extractRGBSamples(rgba);
  const a = countGroups(samples, false);
  const b = countGroups(samples, true);
  const n = a.groups;
  const frac = (v: number) => (n > 0 ? v / n : 0);

  const rm = frac(a.r), sm = frac(a.s), rn = frac(a.rn), sn = frac(a.sn);
  const rmF = frac(b.r), smF = frac(b.s), rnF = frac(b.rn), snF = frac(b.sn);

  let rate = 0;
  if (n > 0) {
    const d0 = rm - sm;
    const dn0 = rn - sn;
    const d1 = rmF - smF;
    const dn1 = rnF - snF;
    const x = solveSmallRoot(2 * (d1 + d0), dn0 - dn1 - d1 - 3 * d0, d0 - dn0);
    const denom = x - 0.5;
    rate = Math.abs(denom) < 1e-12 ? 0 : x / denom;
  }
  const estimatedRate = Number.isFinite(rate) ? Math.min(1, Math.max(0, Math.abs(rate))) : 0;
  return {
    rm, sm, rNegM: rn, sNegM: sn,
    rmFlipped: rmF, smFlipped: smF, rNegMFlipped: rnF, sNegMFlipped: snF,
    estimatedRate,
    anomalyScore: estimatedRate,
  };
}
