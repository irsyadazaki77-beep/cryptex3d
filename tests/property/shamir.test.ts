/**
 * Property tests for GF(256) Shamir's Secret Sharing (2-of-3 as used by Horcrux Mode).
 *
 * Covers: field axioms, reconstruction from every pair (either order) and from all three,
 * refusal with one share, and the secrecy of a single share. Secrecy is shown constructively:
 * for ANY share (x, y) and ANY other secret of the same length there is a coefficient choice
 * that yields the same share, so one share is consistent with every possible secret.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  ShamirError,
  combine,
  combineRecords,
  gfInv,
  gfMul,
  newSetId,
  parseRecord,
  serializeRecord,
  split,
  type Share,
} from '../../src/core/crypto/shamir';

const secretArb = fc.uint8Array({ minLength: 1, maxLength: 96 });
const byteArb = fc.integer({ min: 0, max: 255 });
const nonZeroArb = fc.integer({ min: 1, max: 255 });

describe('GF(256) field', () => {
  it('multiplication is commutative, associative and distributes over xor', () => {
    fc.assert(
      fc.property(byteArb, byteArb, byteArb, (a, b, c) => {
        expect(gfMul(a, b)).toBe(gfMul(b, a));
        expect(gfMul(gfMul(a, b), c)).toBe(gfMul(a, gfMul(b, c)));
        expect(gfMul(a, b ^ c)).toBe(gfMul(a, b) ^ gfMul(a, c));
      }),
    );
  });

  it('1 is the identity and every non-zero element has an inverse', () => {
    fc.assert(
      fc.property(nonZeroArb, (a) => {
        expect(gfMul(a, 1)).toBe(a);
        expect(gfMul(a, gfInv(a))).toBe(1);
      }),
    );
  });

  it('matches the AES test vector 0x57 * 0x83 = 0xc1', () => {
    expect(gfMul(0x57, 0x83)).toBe(0xc1);
  });
});

describe('2-of-3 reconstruction', () => {
  it('any two shares, in either order, rebuild the secret', () => {
    fc.assert(
      fc.property(secretArb, (secret) => {
        const shares = split(secret, 2, 3);
        expect(shares).toHaveLength(3);
        const pairs: Array<[number, number]> = [
          [0, 1],
          [0, 2],
          [1, 2],
        ];
        for (const [i, j] of pairs) {
          expect(combine([shares[i], shares[j]], 2)).toEqual(secret);
          expect(combine([shares[j], shares[i]], 2)).toEqual(secret);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('all three shares also rebuild the secret', () => {
    fc.assert(
      fc.property(secretArb, (secret) => {
        expect(combine(split(secret, 2, 3), 2)).toEqual(secret);
      }),
    );
  });

  it('every share is the same length as the secret and uses x = 1, 2, 3', () => {
    fc.assert(
      fc.property(secretArb, (secret) => {
        const shares = split(secret, 2, 3);
        expect(shares.map((s) => s.x)).toEqual([1, 2, 3]);
        for (const s of shares) expect(s.data.length).toBe(secret.length);
      }),
    );
  });

  it('works for other thresholds too (3-of-5)', () => {
    fc.assert(
      fc.property(secretArb, (secret) => {
        const shares = split(secret, 3, 5);
        expect(combine([shares[4], shares[0], shares[2]], 3)).toEqual(secret);
        expect(combine([shares[1], shares[3], shares[2]], 3)).toEqual(secret);
      }),
      { numRuns: 60 },
    );
  });
});

describe('one share reveals nothing', () => {
  it('combine refuses a single share', () => {
    const [a] = split(new Uint8Array([1, 2, 3]), 2, 3);
    expect(() => combine([a], 2)).toThrow(ShamirError);
    try {
      combine([a], 2);
    } catch (e) {
      expect((e as ShamirError).code).toBe('INSUFFICIENT_SHARDS');
    }
  });

  it('rejects duplicate shares as two distinct shares', () => {
    const [a] = split(new Uint8Array([9, 9, 9]), 2, 3);
    expect(() => combine([a, { x: a.x, data: a.data.slice() }], 2)).toThrow(ShamirError);
  });

  it('perfect secrecy: any share is consistent with ANY other secret', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 40 }).chain((n) =>
          fc.tuple(
            fc.uint8Array({ minLength: n, maxLength: n }),
            fc.uint8Array({ minLength: n, maxLength: n }),
            fc.constantFrom(1, 2, 3),
          ),
        ),
        ([secret, other, x]) => {
          const shares = split(secret, 2, 3);
          const observed = shares[x - 1];
          // Coefficient that would make `other` produce the observed share: a1 = (y ^ s') / x
          const inv = gfInv(x);
          const forced = new Uint8Array(secret.length);
          for (let i = 0; i < forced.length; i++) forced[i] = gfMul(observed.data[i] ^ other[i], inv);
          const replay = split(other, 2, 3, (buf) => buf.set(forced));
          expect(replay[x - 1].data).toEqual(observed.data);
          // ...and that alternative world really is a different secret whenever the inputs differ.
          expect(combine([replay[0], replay[1]], 2)).toEqual(other);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('a single share byte is uniformly distributed for a fixed secret (chi-square)', () => {
    const secret = new Uint8Array(1).fill(0x5a);
    const trials = 4096;
    const hist = new Array<number>(256).fill(0);
    for (let i = 0; i < trials; i++) hist[split(secret, 2, 3)[0].data[0]]++;
    const expected = trials / 256;
    const chi = hist.reduce((acc, o) => acc + ((o - expected) ** 2) / expected, 0);
    // 255 degrees of freedom: mean 255, sd ~22.6. 450 is ~8.6 sd, so a false failure is negligible.
    expect(chi).toBeLessThan(450);
  });

  it('the share does not equal the secret and differs between splits', () => {
    const secret = new Uint8Array(64).fill(7);
    const a = split(secret, 2, 3)[0].data;
    const b = split(secret, 2, 3)[0].data;
    expect(a).not.toEqual(secret);
    expect(a).not.toEqual(b);
  });
});

describe('shard records', () => {
  it('round-trips and rejects malformed bytes', () => {
    fc.assert(
      fc.property(secretArb, (secret) => {
        const shares = split(secret, 2, 3);
        const setId = newSetId();
        const bytes = serializeRecord({ setId, threshold: 2, total: 3, share: shares[1] });
        const parsed = parseRecord(bytes);
        expect(parsed.share.x).toBe(2);
        expect(parsed.share.data).toEqual(shares[1].data);
        expect(parsed.setId).toEqual(setId);
      }),
    );
    expect(() => parseRecord(new Uint8Array(10))).toThrow(ShamirError);
    expect(() => parseRecord(new Uint8Array(64))).toThrow(ShamirError);
  });

  it('records from different splits refuse to combine', () => {
    const secret = new Uint8Array([1, 2, 3, 4]);
    const a = split(secret, 2, 3);
    const b = split(secret, 2, 3);
    const rec = (s: Share, id: Uint8Array) =>
      parseRecord(serializeRecord({ setId: id, threshold: 2, total: 3, share: s }));
    const idA = newSetId();
    const idB = newSetId();
    expect(() => combineRecords([rec(a[0], idA), rec(b[1], idB)])).toThrow(ShamirError);
    expect(combineRecords([rec(a[0], idA), rec(a[2], idA)])).toEqual(secret);
    expect(() => combineRecords([rec(a[0], idA)])).toThrow(ShamirError);
  });

  it('rejects invalid split parameters', () => {
    expect(() => split(new Uint8Array(0), 2, 3)).toThrow(ShamirError);
    expect(() => split(new Uint8Array(4), 1, 3)).toThrow(ShamirError);
    expect(() => split(new Uint8Array(4), 4, 3)).toThrow(ShamirError);
    expect(() => split(new Uint8Array(4), 2, 256)).toThrow(ShamirError);
  });
});
