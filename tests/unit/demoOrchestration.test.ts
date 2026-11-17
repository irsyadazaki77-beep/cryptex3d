import { describe, expect, it, vi } from 'vitest';
import {
  bytesToHex,
  createDemoPayload,
  DEMO_PAYLOAD_LENGTH,
  runDemo,
  type DemoDeps,
  type DemoPhase,
} from '../../src/components/demoOrchestration';

function makeDeps(overrides: Partial<DemoDeps> = {}) {
  const phases: DemoPhase[] = [];
  let encrypted: Uint8Array | null = null;
  const deps: DemoDeps = {
    onPhase: (p) => phases.push(p),
    setSpatialKey: async () => undefined,
    encryptEmbed: async (payload) => {
      encrypted = new Uint8Array(payload);
    },
    transfer: async () => undefined,
    extractDecrypt: async () => new Uint8Array(encrypted ?? []),
    ...overrides,
  };
  return { deps, phases };
}

describe('demo payload', () => {
  it('is deterministic and 1024 bytes', () => {
    const a = createDemoPayload();
    expect(a.length).toBe(DEMO_PAYLOAD_LENGTH);
    expect(a).toEqual(createDemoPayload());
  });
});

describe('runDemo', () => {
  it('completes, walks all phases in order and reports a match', async () => {
    const { deps, phases } = makeDeps();
    const r = await runDemo(deps);
    expect(r.status).toBe('complete');
    if (r.status !== 'complete') return;
    expect(r.matches).toBe(true);
    expect(r.hex).toBe(bytesToHex(createDemoPayload()));
    expect(phases).toEqual(['key', 'encrypt', 'transfer', 'decrypt', 'done']);
  });

  it('reports a mismatch when the decrypted bytes differ', async () => {
    const { deps } = makeDeps({
      extractDecrypt: async () => {
        const p = createDemoPayload();
        p[0] ^= 0xff;
        return p;
      },
    });
    const r = await runDemo(deps);
    expect(r.status === 'complete' && r.matches).toBe(false);
  });

  it('returns an error result with a code-only message when a step fails', async () => {
    const { deps } = makeDeps({
      encryptEmbed: async () => {
        throw Object.assign(new Error('secret passphrase text'), { code: 'AUTH_FAIL' });
      },
    });
    expect(await runDemo(deps)).toEqual({ status: 'error', message: 'AUTH_FAIL' });
  });

  it('times out, aborts the transfer signal and skips later steps', async () => {
    const onAbort = vi.fn();
    const extractDecrypt = vi.fn(async () => new Uint8Array(0));
    let sawSignal: AbortSignal | undefined;
    const { deps } = makeDeps({
      onAbort,
      extractDecrypt,
      transfer: (signal) => {
        sawSignal = signal;
        return new Promise<void>(() => undefined); // never settles
      },
    });
    const r = await runDemo(deps, { timeoutMs: 30 });
    expect(r).toEqual({ status: 'timeout' });
    expect(sawSignal?.aborted).toBe(true);
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(extractDecrypt).not.toHaveBeenCalled();
  });
});
