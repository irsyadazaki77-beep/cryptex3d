/**
 * Property 11: Spatial Key Hash Injectivity
 * For any two spatial keys K and K' differing in exactly one field,
 * SpatialKeySerializer yields different serializedHash values.
 *
 * **Validates: Requirements 2.3, 3.1, 15.7**
 */
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { keyPairOneFieldArb, NUM_RUNS, snapshotOf } from './helpers';

describe('Property 11: spatial key hash injectivity', () => {
  it('keys differing in one field produce different serializedHash', async () => {
    await fc.assert(
      fc.asyncProperty(keyPairOneFieldArb, async ({ a, b }) => {
        const sa = await snapshotOf(a);
        const sb = await snapshotOf(b);
        expect(sa.serializedHash).toMatch(/^[0-9a-f]{64}$/);
        expect(sa.serializedHash).not.toBe(sb.serializedHash);
      }),
      { numRuns: NUM_RUNS },
    );
  }, 120_000);
});
