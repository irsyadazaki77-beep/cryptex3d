import { describe, it, expect } from 'vitest';
import {
  BroadcastChannelFallback,
  BROADCAST_CHANNEL_NAME,
} from '../../src/core/p2p/BroadcastChannelFallback';

// Carrier-sized: 1024 x 1024 RGBA = 4 MiB.
const CARRIER_BYTES = 1024 * 1024 * 4;

function makeBytes(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let s = seed >>> 0;
  for (let i = 0; i < length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = s >>> 24;
  }
  return out;
}

function expectEqualBytes(actual: Uint8Array, expected: Uint8Array): void {
  expect(actual.length).toBe(expected.length);
  // Avoid huge diff output from toEqual on 4 MB arrays.
  expect(Buffer.compare(Buffer.from(actual), Buffer.from(expected))).toBe(0);
}

function nextRawMessage(ch: BroadcastChannel): Promise<unknown> {
  return new Promise((resolve) => {
    ch.onmessage = (ev: MessageEvent) => {
      ch.onmessage = null;
      resolve(ev.data);
    };
  });
}

function nextFallbackMessage(fb: BroadcastChannelFallback): Promise<Uint8Array> {
  return new Promise((resolve) => {
    const off = fb.on('received', (data: Uint8Array) => {
      if (typeof off === 'function') off();
      resolve(data);
    });
  });
}

describe('BroadcastChannel integration (cryptex3d-p2p)', () => {
  it('transfers a ~4 MB Uint8Array between two raw channels, repeatedly, without reopening', async () => {
    const a = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    const b = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    try {
      for (let round = 0; round < 3; round++) {
        const payload = makeBytes(CARRIER_BYTES, 1000 + round);
        const pending = nextRawMessage(b);
        a.postMessage(payload);
        const data = await pending;
        expect(data).toBeInstanceOf(Uint8Array);
        expectEqualBytes(data as Uint8Array, payload);
      }
    } finally {
      a.close();
      b.close();
    }
  });

  it('transfers a ~4 MB Uint8Array between two BroadcastChannelFallback instances, repeatedly, in both directions', async () => {
    const a = new BroadcastChannelFallback();
    const b = new BroadcastChannelFallback();
    a.activateFallback();
    b.activateFallback();
    try {
      expect(a.isActive).toBe(true);
      expect(b.isActive).toBe(true);
      for (let round = 0; round < 3; round++) {
        const payload = makeBytes(CARRIER_BYTES, 2000 + round);
        const [sender, receiver] = round % 2 === 0 ? [a, b] : [b, a];
        const pending = nextFallbackMessage(receiver);
        sender.send(payload);
        expectEqualBytes(await pending, payload);
      }
    } finally {
      a.close();
      b.close();
    }
  });

  it('interoperates between a raw channel and a fallback instance', async () => {
    const raw = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    const fb = new BroadcastChannelFallback();
    fb.activateFallback();
    try {
      const p1 = makeBytes(CARRIER_BYTES, 3001);
      const got1 = nextFallbackMessage(fb);
      raw.postMessage(p1);
      expectEqualBytes(await got1, p1);

      const p2 = makeBytes(CARRIER_BYTES, 3002);
      const got2 = nextRawMessage(raw);
      fb.send(p2);
      const data = await got2;
      expect(data).toBeInstanceOf(Uint8Array);
      expectEqualBytes(data as Uint8Array, p2);
    } finally {
      raw.close();
      fb.close();
    }
  });

  it('throws when sending on a closed fallback', () => {
    const fb = new BroadcastChannelFallback();
    fb.activateFallback();
    fb.close();
    expect(fb.isActive).toBe(false);
    expect(() => fb.send(new Uint8Array(1))).toThrow('BROADCAST_CHANNEL_NOT_ACTIVE');
  });
});
