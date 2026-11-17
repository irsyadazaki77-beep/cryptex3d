/**
 * Property 8: No plaintext / passphrase / key leakage.
 * **Validates: Requirements 12.1, 12.2, 12.3**
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fc from 'fast-check';
import { handleCryptoMessage } from '../../src/core/crypto/CryptoWorker';
import { sanitizeError } from '../../src/components/errorSanitizer';
import type { SpatialKeySnapshot, WorkerMessage } from '../../src/store/types';

const sk = (hash: string): SpatialKeySnapshot => ({
  monolithRotationX: 0.5,
  monolithRotationY: 1.25,
  monolithRotationZ: 2,
  ringSegmentPositions: [1, 2, 3],
  crystalActivated: true,
  serializedHash: hash,
});

const req = (op: string, payload: unknown): WorkerMessage => ({
  kind: 'request',
  id: 'leak-test',
  target: 'crypto',
  op,
  payload,
});

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function serialize(args: unknown[]): string {
  const seen = new WeakSet<object>();
  const parts = args.map((a) => {
    try {
      return JSON.stringify(a, (_k, v: unknown) => {
        if (typeof v === 'bigint') return v.toString();
        if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
        if (v instanceof Uint8Array) return { hex: toHex(v), arr: Array.from(v) };
        if (v instanceof ArrayBuffer) return Array.from(new Uint8Array(v));
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v)) return '[circular]';
          seen.add(v);
        }
        return v;
      }) ?? String(a);
    } catch {
      return String(a);
    }
  });
  return parts.join('\n') + '\n' + args.map((a) => String(a)).join('\n');
}

function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

function toBase64(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

/** All string forms of the payload that could show up in a log. */
function payloadForms(b: Uint8Array): string[] {
  return [
    toHex(b),
    toBase64(b),
    JSON.stringify(Array.from(b)),
    Array.from(b).join(','),
    JSON.stringify(Object.fromEntries(Array.from(b).map((v, i) => [i, v]))),
    new TextDecoder().decode(b).length >= 8 && !new TextDecoder().decode(b).includes('\uFFFD')
      ? new TextDecoder().decode(b)
      : '',
  ].filter((s) => s.length > 0);
}

describe('Property 8: no leakage of secrets', () => {
  const consoleMethods = ['log', 'debug', 'info', 'warn', 'error'] as const;
  const spies: Array<{ mockRestore: () => void; mock: { calls: unknown[][] } }> = [];
  let fetchSpy: { mock: { calls: unknown[][] } } | undefined;
  let restoreFetch: (() => void) | undefined;
  let xhrSpy: { mock: { calls: unknown[][] } } | undefined;

  beforeAll(() => {
    for (const m of consoleMethods) {
      spies.push(vi.spyOn(console, m).mockImplementation(() => undefined) as never);
    }
    const g = globalThis as { fetch?: unknown };
    const origFetch = g.fetch;
    const fetchMock = vi.fn(() => Promise.reject(new Error('network blocked in test')));
    g.fetch = fetchMock;
    fetchSpy = fetchMock;
    restoreFetch = () => {
      g.fetch = origFetch;
    };
    const X = (globalThis as { XMLHttpRequest?: { prototype: { send: unknown } } }).XMLHttpRequest;
    if (X && typeof X.prototype.send === 'function') {
      xhrSpy = vi
        .spyOn(X.prototype as { send: () => void }, 'send')
        .mockImplementation(() => undefined) as never;
      spies.push(xhrSpy as never);
    }
  });

  afterAll(() => {
    for (const s of spies) s.mockRestore();
    restoreFetch?.();
  });

  it(
    'never exposes payload, passphrase or key material via console, HUD error text or network',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 8, maxLength: 96 }),
          fc.stringMatching(/^[0-9a-f]{12,24}$/),
          fc.string({ minLength: 0, maxLength: 7 }),
          async (payload, suffix, shortPass) => {
            const passphrase = `PW-LEAK-${suffix}`;
            const forms = payloadForms(payload);

            const enc = await handleCryptoMessage(
              req('encrypt', { payload, passphrase, spatialKeySnapshot: sk(HASH_A) }),
            );
            expect(enc.kind).toBe('response');
            const bundle = (enc as { payload: Record<string, Uint8Array> }).payload;

            const ok = await handleCryptoMessage(
              req('decrypt', { ...bundle, passphrase, spatialKeySnapshot: sk(HASH_A) }),
            );
            expect(ok.kind).toBe('response');

            const wrongKey = await handleCryptoMessage(
              req('decrypt', { ...bundle, passphrase, spatialKeySnapshot: sk(HASH_B) }),
            );
            const shortPw = await handleCryptoMessage(
              req('encrypt', { payload, passphrase: shortPass, spatialKeySnapshot: sk(HASH_A) }),
            );

            // Error replies carry only codes with fixed messages.
            const errors = [wrongKey, shortPw];
            expect(wrongKey.kind).toBe('error');
            expect(shortPw.kind).toBe('error');
            expect((wrongKey as { code: string }).code).toBe('AUTH_FAIL');
            expect((shortPw as { code: string }).code).toBe('INVALID_PASSPHRASE');
            for (const e of errors) {
              const reply = e as { code: string; message: string };
              const text = JSON.stringify(e);
              expect(text).not.toContain(passphrase);
              expect(text).not.toContain(suffix);
              for (const f of forms) expect(text).not.toContain(f);
              expect(reply.message).toMatch(/^[A-Za-z .]{1,60}$/);
              // HUD text after failure (lastError is the code/message).
              const hud = [sanitizeError(reply.code), sanitizeError(reply.message)].join('\n');
              expect(hud).not.toContain(passphrase);
              expect(hud).not.toContain(suffix);
              for (const f of forms) expect(hud).not.toContain(f);
            }

            // Spies: console and network.
            const calls: unknown[][] = [];
            for (const s of spies) calls.push(...s.mock.calls);
            if (fetchSpy) calls.push(...fetchSpy.mock.calls);
            const logged = calls.map((c) => serialize(c)).join('\n');
            expect(logged).not.toContain(passphrase);
            expect(logged).not.toContain(suffix);
            for (const f of forms) expect(logged).not.toContain(f);
          },
        ),
        { numRuns: 500 },
      );

      // Nothing at all was sent over the network or logged during the run.
      expect(fetchSpy?.mock.calls.length ?? 0).toBe(0);
      expect(xhrSpy?.mock.calls.length ?? 0).toBe(0);
      for (const s of spies) expect(s.mock.calls.length).toBe(0);
    },
    30 * 60 * 1000,
  );
});
