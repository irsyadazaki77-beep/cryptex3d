import { chiSquareTest } from './ChiSquareTest';
import { shannonEntropy } from './ShannonEntropyCalc';
import { analyzeLSBPairs } from './LSBPairAnalyzer';

/**
 * Weighted heuristic detectability score for a carrier's LSB plane.
 * 0 = indistinguishable from a natural image, 100 = high anomaly.
 * Pure JS; no network access. Advisory only.
 */

export interface HeuristicComponents {
  /** Chi-square p-value of the packed LSB plane vs. uniform. */
  chiSquarePValue: number;
  /** Shannon entropy (bits/byte) of the packed LSB plane. */
  shannonEntropy: number;
  /** 8 - shannonEntropy. Small delta = LSB plane looks random = suspicious. */
  entropyDelta: number;
  /** RS-estimated fraction of LSB-embedded samples, [0, 1]. */
  lsbPairAnomaly: number;
}

export interface HeuristicResult extends HeuristicComponents {
  /** Per-component anomaly sub-scores, each in [0, 1]. */
  subScores: { chiSquare: number; entropy: number; lsbPair: number };
  /** Final score, clamped to [0, 100]. */
  score: number;
  /** True when the optional advanced model contributed to the score. */
  advancedUsed: boolean;
}

export interface ScoreOptions {
  advancedAudit?: boolean;
  /** Local model directory/id for the optional advanced audit. */
  advancedModelPath?: string;
}

/** Weights sum to 1. Tuned against tests/unit/auditor-scoring.test.ts. */
export const WEIGHTS = { chiSquare: 0.55, entropy: 0.15, lsbPair: 0.3 } as const;

/** Fraction of the final score taken from the advanced model when it is available. */
const ADVANCED_BLEND = 0.4;

const clamp = (v: number, lo: number, hi: number): number =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;

/**
 * A natural image's LSB plane is structured, so its chi-square p-value against a
 * uniform byte distribution is ~0. Random (encrypted) LSBs give a large p-value.
 * Maps log10(p) over [-6, 0] to [0, 1].
 */
function chiSubScore(p: number): number {
  return clamp((Math.log10(Math.max(p, 1e-6)) + 6) / 6, 0, 1);
}

/** Entropy delta of 0 => 1; delta >= 2 bits/byte => 0. */
function entropySubScore(delta: number): number {
  return clamp(1 - delta / 2, 0, 1);
}

export function scoreFromComponents(c: HeuristicComponents): Pick<HeuristicResult, 'subScores' | 'score'> {
  const subScores = {
    chiSquare: chiSubScore(c.chiSquarePValue),
    entropy: entropySubScore(c.entropyDelta),
    lsbPair: clamp(c.lsbPairAnomaly, 0, 1),
  };
  const raw =
    100 * (WEIGHTS.chiSquare * subScores.chiSquare +
      WEIGHTS.entropy * subScores.entropy +
      WEIGHTS.lsbPair * subScores.lsbPair);
  return { subScores, score: clamp(raw, 0, 100) };
}

/** Pixels per analysis band (about 24 KB of packed LSB plane, enough for a 256-bucket chi-square). */
const BAND_PIXELS = 65536;
const MAX_BANDS = 16;

function analyzeBand(rgba: Uint8ClampedArray): HeuristicComponents {
  const chi = chiSquareTest(rgba);
  const h = shannonEntropy(rgba);
  const rs = analyzeLSBPairs(rgba);
  return {
    chiSquarePValue: chi.pValue,
    shannonEntropy: h,
    entropyDelta: 8 - h,
    lsbPairAnomaly: rs.anomalyScore,
  };
}

/**
 * Pure-JS heuristic analysis of an RGBA carrier buffer.
 * The LSB plane is analysed in contiguous bands and the most anomalous band is
 * reported, because a payload that fills only part of the carrier is diluted
 * to nothing by whole-image statistics.
 */
export function scoreHeuristic(rgba: Uint8ClampedArray): HeuristicResult {
  const pixels = Math.floor(rgba.length / 4);
  const bands = Math.min(MAX_BANDS, Math.max(1, Math.floor(pixels / BAND_PIXELS)));
  const bandPixels = Math.floor(pixels / bands);
  let best: HeuristicComponents | null = null;
  let bestScore = -1;
  for (let b = 0; b < bands; b++) {
    const end = b === bands - 1 ? pixels : (b + 1) * bandPixels;
    const comp = analyzeBand(rgba.subarray(b * bandPixels * 4, end * 4));
    const s = scoreFromComponents(comp).score;
    if (s > bestScore) {
      bestScore = s;
      best = comp;
    }
  }
  const components = best ?? analyzeBand(rgba);
  return { ...components, ...scoreFromComponents(components), advancedUsed: false };
}

interface ClassifierOutput { label: string; score: number }
type TextClassifier = (input: string) => Promise<ClassifierOutput[] | ClassifierOutput>;
interface TransformersModule {
  env: { allowRemoteModels: boolean; allowLocalModels: boolean; localModelPath?: string };
  pipeline: (task: string, model: string) => Promise<TextClassifier>;
}

/**
 * Optional local model. Loaded lazily; local files only (remote models disabled).
 * Returns an anomaly probability in [0, 1], or null on any failure.
 */
async function advancedModelScore(c: HeuristicComponents, modelPath: string): Promise<number | null> {
  try {
    const mod = (await import('@huggingface/transformers')) as unknown as TransformersModule;
    mod.env.allowRemoteModels = false;
    mod.env.allowLocalModels = true;
    const classify = await mod.pipeline('text-classification', modelPath);
    const summary =
      `entropy=${c.shannonEntropy.toFixed(4)} chi_p=${c.chiSquarePValue.toExponential(3)} ` +
      `rs_rate=${c.lsbPairAnomaly.toFixed(4)}`;
    const out = await classify(summary);
    const first = Array.isArray(out) ? out[0] : out;
    if (!first || !Number.isFinite(first.score)) return null;
    const positive = /anomal|stego|positive|label_1/i.test(first.label);
    return clamp(positive ? first.score : 1 - first.score, 0, 1);
  } catch {
    return null; // fall back to heuristics
  }
}

/**
 * Scores a carrier. `@huggingface/transformers` is only imported when
 * `advancedAudit` is true; any failure falls back to the heuristic score.
 */
export async function scoreCarrier(
  rgba: Uint8ClampedArray,
  options: ScoreOptions = {},
): Promise<HeuristicResult> {
  const base = scoreHeuristic(rgba);
  if (!options.advancedAudit) return base;
  const adv = await advancedModelScore(base, options.advancedModelPath ?? '/models/cryptex-audit');
  if (adv === null) return base;
  const blended = (1 - ADVANCED_BLEND) * base.score + ADVANCED_BLEND * adv * 100;
  return { ...base, score: clamp(blended, 0, 100), advancedUsed: true };
}
