import { byteHistogram, packLSBPlane } from './lsbPlane';

export interface ChiSquareResult {
  /** Pearson chi-square statistic over 256 byte buckets. */
  statistic: number;
  /** Degrees of freedom (255). */
  degreesOfFreedom: number;
  /** Upper-tail p-value P(X >= statistic). High (near 1) => consistent with uniform/random LSBs. */
  pValue: number;
}

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** ln(Gamma(x)) via Lanczos approximation (x > 0). */
function lnGamma(x: number): number {
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  }
  const xm = x - 1;
  let a = 0.99999999999980993;
  const t = xm + 7.5;
  for (let i = 0; i < LANCZOS.length; i++) a += LANCZOS[i]! / (xm + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (xm + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularized lower incomplete gamma P(a, x). */
function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    // Series expansion
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 0; n < 1000; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  return 1 - gammaQContinuedFraction(a, x);
}

/** Regularized upper incomplete gamma Q(a, x) by Lentz continued fraction (x >= a+1). */
function gammaQContinuedFraction(a: number, x: number): number {
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

/** Chi-square CDF with k degrees of freedom: P(X <= x). */
export function chiSquareCDF(x: number, k: number): number {
  if (!(x > 0)) return 0;
  return Math.min(1, Math.max(0, gammaP(k / 2, x / 2)));
}

/** Chi-square survival function: P(X >= x). */
export function chiSquareSurvival(x: number, k: number): number {
  if (!(x > 0)) return 1;
  const a = k / 2;
  const hx = x / 2;
  const q = hx < a + 1 ? 1 - gammaP(a, hx) : gammaQContinuedFraction(a, hx);
  return Math.min(1, Math.max(0, q));
}

/** Chi-square statistic and p-value from a 256-bucket histogram vs. a uniform expectation. */
export function chiSquareFromHistogram(hist: ArrayLike<number>): ChiSquareResult {
  let total = 0;
  for (let i = 0; i < 256; i++) total += hist[i] ?? 0;
  const dof = 255;
  if (total === 0) return { statistic: 0, degreesOfFreedom: dof, pValue: 1 };
  const expected = total / 256;
  let stat = 0;
  for (let i = 0; i < 256; i++) {
    const d = (hist[i] ?? 0) - expected;
    stat += (d * d) / expected;
  }
  return { statistic: stat, degreesOfFreedom: dof, pValue: chiSquareSurvival(stat, dof) };
}

/**
 * Chi-square test of the carrier's R,G,B LSB plane (packed MSB-first into bytes,
 * see lsbPlane.ts) against a uniform byte distribution.
 */
export function chiSquareTest(rgba: Uint8ClampedArray): ChiSquareResult {
  return chiSquareFromHistogram(byteHistogram(packLSBPlane(rgba)));
}
