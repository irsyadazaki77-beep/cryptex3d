import { describe, it, expect, afterEach } from 'vitest';
import { BroadcastChannelFallback } from '../../src/core/p2p/BroadcastChannelFallback';

const open: BroadcastChannelFallback[] = [];
function make(): BroadcastChannelFallback {
  const f = new BroadcastChannelFallback();
  open.push(f);
  return f;
}
function next(f: BroadcastChannelFallback): Promise<Uint8Array> {
  return new Promise((resolve) => {
    const off = f.on('received', (d) => {
      off();
      resolve(d);
    });
  });
}

afterEach(() => {
  open.splice(0).forEach((f) => f.close());
});

describe('BroadcastChannelFallback', () => {
  it('delivers identical bytes between two instances, repeatedly', async () => {
    const a = make();
    const b = make();
    a.activateFallback();
    b.activate();
    for (const bytes of [new Uint8Array([1, 2, 3, 255, 0]), new Uint8Array(1000).fill(7)]) {
      const p = next(b);
      a.send(bytes);
      const got = await p;
      expect(got.length).toBe(bytes.length);
      expect(Array.from(got)).toEqual(Array.from(bytes));
    }
  });

  it('activation is idempotent and send before activation throws', () => {
    const a = make();
    expect(() => a.send(new Uint8Array([1]))).toThrow();
    a.activateFallback();
    a.activateFallback();
    expect(a.isActive).toBe(true);
    a.close();
    expect(a.isActive).toBe(false);
  });

  it('autoActivate activates only when RTCPeerConnection is unavailable', () => {
    const g = globalThis as { RTCPeerConnection?: unknown };
    const saved = g.RTCPeerConnection;
    delete g.RTCPeerConnection;
    const f = BroadcastChannelFallback.autoActivate();
    open.push(f);
    expect(f.isActive).toBe(true);
    g.RTCPeerConnection = function () {};
    const f2 = BroadcastChannelFallback.autoActivate();
    open.push(f2);
    expect(f2.isActive).toBe(false);
    if (saved === undefined) delete g.RTCPeerConnection;
    else g.RTCPeerConnection = saved;
  });
});
