/**
 * Integration: pipeline latency budget (Requirement 15.1).
 *
 * Times encrypt + embed + audit for a 100 KB payload and asserts the whole
 * sequence completes in under 5000 ms.
 *
 * Note: PNG decode/encode needs browser APIs (createImageBitmap / OffscreenCanvas)
 * that are unavailable in Node, so the Worker handlers for stego and auditor
 * cannot be driven end to end here. Instead the real in-process building blocks
 * are used on a raw 1024x1024 RGBA buffer:
 *   - encrypt: handleCryptoMessage (real PBKDF2 + AES-256-GCM)
 *   - embed:   packPayload + LSBEmbedder.embed
 *   - audit:   scoreCarrier + buildAuditReport
 * PNG codec time is therefore excluded from the measurement.
 */
import { describe, it, expect } from 'vitest';
import { handleCryptoMessage } from '../../src/core/crypto/CryptoWorker';
import type { EncryptResponsePayload } from '../../src/core/crypto/CryptoWorker';
import { packPayload } from '../../src/core/stego/payloadPacking';
import { embed } from '../../src/core/stego/LSBEmbedder';
import { scoreCarrier } from '../../src/core/auditor/HeuristicScorer';
import { buildAuditReport } from '../../src/core/auditor/AuditReportBuilder';
import type { SpatialKeySnapshot } from '../../src/store/types';

const BUDGET_MS = 5000;
const PAYLOAD_BYTES = 100 * 1024;
const SIZE = 1024;

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let off = 0; off < n; off += 65536) {
    crypto.getRandomValues(out.subarray(off, Math.min(n, off + 65536)));
  }
  return out;
}

/** Opaque, noisy 1024x1024 RGBA carrier (stand-in for a decoded PNG). */
function makeCarrier(): Uint8ClampedArray {
  const px = new Uint8ClampedArray(SIZE * SIZE * 4);
  px.set(randomBytes(px.length));
  for (let i = 3; i < px.length; i += 4) px[i] = 255;
  return px;
}

const snapshot: SpatialKeySnapshot = {
  monolithRotationX: 0,
  monolithRotationY: 0,
  monolithRotationZ: 0,
  ringSegmentPositions: [0, 0, 0],
  crystalActivated: false,
  serializedHash: 'c'.repeat(64),
};

describe('pipeline latency budget', () => {
  it('completes encrypt + embed + audit of a 100 KB payload in < 5000 ms', async () => {
    const payload = randomBytes(PAYLOAD_BYTES);
    const carrier = makeCarrier();

    const start = performance.now();

    const enc = await handleCryptoMessage({
      kind: 'request',
      id: 'lat-1',
      target: 'crypto',
      op: 'encrypt',
      payload: { payload, passphrase: 'latency budget passphrase', spatialKeySnapshot: snapshot },
    });
    expect(enc.kind).toBe('response');
    const bundle = (enc as { payload: EncryptResponsePayload }).payload;

    const packed = packPayload(bundle);
    const stego = embed(carrier, packed);

    const result = await scoreCarrier(stego, { advancedAudit: false });
    const report = buildAuditReport(result);

    const elapsed = performance.now() - start;

    expect(stego.length).toBe(carrier.length);
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });
});
