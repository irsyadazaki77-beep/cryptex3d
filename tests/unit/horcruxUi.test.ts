import { describe, expect, it } from 'vitest';
import { detectShardKind } from '../../src/components/shardKind';
import { buildWav } from '../../src/core/stego/audioStego';
import { TTL_OPTIONS, ttlFor } from '../../src/components/ttlOptions';
import { MAX_HORCRUX_FILE_BYTES, validateHorcruxSize } from '../../src/components/encryptValidation';
import { HORCRUX_MAX_SECRET_BYTES } from '../../src/core/crypto/horcrux';
import { SHARD_COUNT, SHATTER_DURATION_MS, glitchEnvelope, shardLife } from '../../src/scene/artifacts/ShatterEffect';

describe('detectShardKind', () => {
  it('recognises PNG, WAV and token files by magic bytes, not by name', () => {
    expect(detectShardKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]))).toBe('png');
    expect(detectShardKind(buildWav(new Int16Array(8)))).toBe('wav');
    expect(detectShardKind(new TextEncoder().encode('  \n{"format":"cryptex3d-spatial-token"}'))).toBe('token');
  });

  it('rejects everything else', () => {
    expect(detectShardKind(new Uint8Array(0))).toBeNull();
    expect(detectShardKind(new Uint8Array(100).fill(0x41))).toBeNull();
    expect(detectShardKind(new TextEncoder().encode('plain text'))).toBeNull();
    expect(detectShardKind(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 1, 2, 3, 4]))).toBeNull();
  });
});

describe('dead-drop option helpers', () => {
  it('maps TTL ids to milliseconds', () => {
    expect(ttlFor('none')).toBeUndefined();
    expect(ttlFor('1m')).toBe(60_000);
    expect(ttlFor('7d')).toBe(7 * 24 * 3600 * 1000);
    expect(ttlFor('bogus')).toBeUndefined();
    expect(new Set(TTL_OPTIONS.map((o) => o.id)).size).toBe(TTL_OPTIONS.length);
  });

  it('keeps the UI Horcrux limit equal to the crypto layer limit', () => {
    expect(MAX_HORCRUX_FILE_BYTES).toBe(HORCRUX_MAX_SECRET_BYTES);
    expect(validateHorcruxSize(MAX_HORCRUX_FILE_BYTES)).toBeNull();
    expect(validateHorcruxSize(MAX_HORCRUX_FILE_BYTES + 1)).toMatch(/64 KB/);
  });
});

describe('shatter effect envelopes', () => {
  it('glitch is zero outside the effect, strong at the start and decays', () => {
    expect(glitchEnvelope(-1)).toBe(0);
    expect(glitchEnvelope(SHATTER_DURATION_MS)).toBe(0);
    expect(glitchEnvelope(30)).toBeGreaterThan(0.5);
    let peakLate = 0;
    for (let t = SHATTER_DURATION_MS * 0.8; t < SHATTER_DURATION_MS; t += 7) peakLate = Math.max(peakLate, glitchEnvelope(t));
    expect(peakLate).toBeLessThan(0.3);
    for (let t = 0; t <= SHATTER_DURATION_MS; t += 11) {
      const g = glitchEnvelope(t);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
    }
  });

  it('shards stay full size for the first half and fade to nothing', () => {
    expect(shardLife(0)).toBe(1);
    expect(shardLife(SHATTER_DURATION_MS * 0.5)).toBe(1);
    expect(shardLife(SHATTER_DURATION_MS * 0.775)).toBeCloseTo(0.5, 1);
    expect(shardLife(SHATTER_DURATION_MS)).toBe(0);
  });

  it('stays lightweight: one instanced draw of a few hundred shards at most', () => {
    expect(SHARD_COUNT).toBeLessThanOrEqual(300);
  });
});
