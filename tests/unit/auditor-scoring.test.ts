import { describe, it, expect } from 'vitest';
import { scoreHeuristic, scoreCarrier, scoreFromComponents } from '../../src/core/auditor/HeuristicScorer';
import { buildAuditReport } from '../../src/core/auditor/AuditReportBuilder';
import { embed } from '../../src/core/stego/LSBEmbedder';

const SIZE = 1024;

function rng(seed: number) {
  let s = seed >>> 0; // mulberry32
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Smooth gradient texture with weak noise (sigma ~0.5 level): a low-noise image whose
 * LSB plane is still structured. Very noisy images have random LSBs and are
 * inherently hard to separate from embedded data with these statistics.
 */
function naturalCarrier(): Uint8ClampedArray {
  const r = rng(7);
  const b = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const base = 128 + 70 * Math.sin(x / 90) * Math.cos(y / 130);
      for (let c = 0; c < 3; c++) {
        const noise = Math.round(r() + r() + r() - 1.5);
        b[i + c] = Math.round(base + c * 6) + noise;
      }
      b[i + 3] = 255;
    }
  }
  return b;
}

function randomPayload(n: number, seed: number): Uint8Array {
  const r = rng(seed);
  const p = new Uint8Array(n);
  for (let i = 0; i < n; i++) p[i] = (r() * 256) | 0;
  return p;
}

describe('HeuristicScorer', () => {
  const clean = naturalCarrier();
  const small = embed(clean, randomPayload(20_000, 1));
  const large = embed(clean, randomPayload(120_000, 2));

  const sClean = scoreHeuristic(clean);
  const sSmall = scoreHeuristic(small);
  const sLarge = scoreHeuristic(large);

  it('scores a natural-ish carrier low', () => {
    expect(sClean.score).toBeLessThan(25);
  });

  it('scores a heavily embedded carrier high', () => {
    expect(sLarge.score).toBeGreaterThan(60);
  });

  it('score increases with embedded payload size', () => {
    expect(sSmall.score).toBeGreaterThan(sClean.score);
    expect(sLarge.score).toBeGreaterThan(sSmall.score);
  });

  it('keeps score within [0, 100] for extreme components', () => {
    const hi = scoreFromComponents({ chiSquarePValue: 5, shannonEntropy: 9, entropyDelta: -1, lsbPairAnomaly: 7 });
    const lo = scoreFromComponents({ chiSquarePValue: -1, shannonEntropy: 0, entropyDelta: 80, lsbPairAnomaly: -3 });
    const nan = scoreFromComponents({ chiSquarePValue: NaN, shannonEntropy: NaN, entropyDelta: NaN, lsbPairAnomaly: NaN });
    for (const s of [hi.score, lo.score, nan.score]) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });

  it('falls back to heuristics when the advanced model cannot load', async () => {
    const r = await scoreCarrier(clean, { advancedAudit: true, advancedModelPath: '/nonexistent/model' });
    expect(r.advancedUsed).toBe(false);
    expect(r.score).toBeCloseTo(sClean.score, 6);
  }, 30_000);

  it('does not use the advanced path by default', async () => {
    const r = await scoreCarrier(clean);
    expect(r.advancedUsed).toBe(false);
  });
});

describe('AuditReportBuilder', () => {
  const report = buildAuditReport(scoreHeuristic(embed(naturalCarrier(), randomPayload(120_000, 3))));

  it('produces a report that satisfies the size limits', () => {
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(report.warnings.length).toBeLessThanOrEqual(10);
    for (const w of report.warnings) expect(w.length).toBeLessThanOrEqual(200);
    expect(report.recommendation.length).toBeGreaterThan(0);
    expect(report.recommendation.length).toBeLessThanOrEqual(500);
    expect(Number.isFinite(report.shannonEntropy)).toBe(true);
    expect(Number.isFinite(report.chiSquarePValue)).toBe(true);
  });

  it('flags the embedded carrier with at least one warning', () => {
    expect(report.warnings.length).toBeGreaterThan(0);
  });
});
