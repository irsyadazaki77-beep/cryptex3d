import { describe, it, expect, vi } from 'vitest';
import {
  CHUNK_SIZE,
  Reassembler,
  chunkData,
  decodeFrame,
  encodeAckFrame,
  FramingError,
} from '../../src/core/p2p/framing';
import { DataChannelHandler, type DataChannelTransport } from '../../src/core/p2p/DataChannelHandler';
import { TransferProgressTracker } from '../../src/core/p2p/TransferProgressTracker';

function bytes(n: number): Uint8Array {
  const a = new Uint8Array(n);
  for (let i = 0; i < n; i++) a[i] = (i * 31 + 7) & 0xff;
  return a;
}

function reassemble(data: Uint8Array, order?: (n: number) => number[]): Uint8Array {
  const [start, ...rest] = chunkData(data).map((f) => decodeFrame(f)!);
  if (start.type !== 'start') throw new Error('no start');
  const r = new Reassembler();
  r.start(start.totalLength, start.chunkCount);
  const idx = order ? order(rest.length) : rest.map((_, i) => i);
  for (const i of idx) {
    const f = rest[i];
    if (f.type === 'data') r.addChunk(f.index, f.payload);
  }
  return r.assemble();
}

describe('framing', () => {
  it.each([0, 1, CHUNK_SIZE - 1, CHUNK_SIZE, CHUNK_SIZE + 1, CHUNK_SIZE * 3 + 5])(
    'round-trips %i bytes',
    (n) => {
      const data = bytes(n);
      expect(reassemble(data)).toEqual(data);
    },
  );

  it('reassembles out-of-order and duplicate chunks', () => {
    const data = bytes(CHUNK_SIZE * 3 + 10);
    expect(reassemble(data, (n) => [3, 1, 1, 0, 2].slice(0, n + 1))).toEqual(data);
  });

  it('uses 16 KB chunks with a 4-byte big-endian index header', () => {
    const frames = chunkData(bytes(CHUNK_SIZE * 2 + 1));
    expect(frames).toHaveLength(1 + 3);
    expect(frames[2].length).toBe(5 + CHUNK_SIZE);
    expect(Array.from(frames[3].subarray(1, 5))).toEqual([0, 0, 0, 2]);
  });

  it('rejects out-of-range and wrong-size chunks', () => {
    const r = new Reassembler();
    r.start(CHUNK_SIZE + 1, 2);
    expect(() => r.addChunk(2, new Uint8Array(1))).toThrow(FramingError);
    expect(() => r.addChunk(0, new Uint8Array(5))).toThrow(FramingError);
  });

  it('returns null for unknown frames', () => {
    expect(decodeFrame(new Uint8Array([9, 0, 0, 0, 0]))).toBeNull();
  });
});

describe('TransferProgressTracker', () => {
  it('emits byte counts', () => {
    const t = new TransferProgressTracker();
    const seen: number[] = [];
    t.on('progress', (p) => seen.push(p.bytesTransferred));
    t.start(100);
    t.add(40);
    t.add(100);
    expect(seen).toEqual([0, 40, 100]);
  });
});

// ---- handler with fake transports ----

type Listener = (d: never) => void;
class FakeChannel extends EventTarget {
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
}

class FakeTransport {
  channel = new FakeChannel();
  listeners = new Map<string, Set<Listener>>();
  peer: FakeTransport | null = null;
  sent: Uint8Array[] = [];
  get dataChannel() {
    return this.channel as unknown as RTCDataChannel;
  }
  on(type: string, l: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(l);
    return () => this.listeners.get(type)!.delete(l);
  }
  fire(type: string, detail?: unknown) {
    this.listeners.get(type)?.forEach((l) => (l as (d: unknown) => void)(detail));
  }
  sendData(d: Uint8Array) {
    this.sent.push(d);
    const peer = this.peer;
    if (peer) queueMicrotask(() => peer.fire('data', d.slice()));
  }
}

const asTransport = (t: FakeTransport) => t as unknown as DataChannelTransport;

describe('DataChannelHandler', () => {
  it('transfers payload end to end and resolves on ack', async () => {
    const a = new FakeTransport();
    const b = new FakeTransport();
    a.peer = b;
    b.peer = a;
    const fb = { activateFallback: vi.fn() };
    const sender = new DataChannelHandler(asTransport(a), fb);
    const receiver = new DataChannelHandler(asTransport(b), fb);
    const data = bytes(CHUNK_SIZE * 4 + 123);
    const got = new Promise<Uint8Array>((res) => receiver.on('complete', res));
    const progress: number[] = [];
    sender.on('progress', (p) => progress.push(p.bytesTransferred));

    await sender.send(data);
    expect(await got).toEqual(data);
    expect(progress.at(-1)).toBe(data.length);
    expect(fb.activateFallback).not.toHaveBeenCalled();
    expect(a.channel.bufferedAmountLowThreshold).toBeGreaterThan(0);
  });

  it('waits for bufferedamountlow when buffer is above the high-water mark', async () => {
    const a = new FakeTransport();
    a.channel.bufferedAmount = 1_000_000;
    const h = new DataChannelHandler(asTransport(a), { activateFallback: vi.fn() });
    void h.send(bytes(CHUNK_SIZE * 2)).catch(() => {});
    await new Promise((r) => setTimeout(r, 0));
    expect(a.sent).toHaveLength(1); // start frame only
    a.channel.bufferedAmount = 0;
    a.channel.dispatchEvent(new Event('bufferedamountlow'));
    await new Promise((r) => setTimeout(r, 0));
    expect(a.sent).toHaveLength(3);
  });

  it('activates fallback and rejects when the channel closes mid-transfer', async () => {
    const a = new FakeTransport();
    a.channel.bufferedAmount = 1_000_000;
    const fb = { activateFallback: vi.fn() };
    const h = new DataChannelHandler(asTransport(a), fb);
    h.on('error', () => {});
    const p = h.send(bytes(CHUNK_SIZE * 2));
    await new Promise((r) => setTimeout(r, 0));
    a.fire('close');
    await expect(p).rejects.toThrow(/failed/);
    expect(fb.activateFallback).toHaveBeenCalledTimes(1);
  });

  it('does not activate fallback on close when idle', () => {
    const a = new FakeTransport();
    const fb = { activateFallback: vi.fn() };
    new DataChannelHandler(asTransport(a), fb);
    a.fire('close');
    a.fire('statechange', 'failed');
    expect(fb.activateFallback).not.toHaveBeenCalled();
  });

  it('ignores ack with wrong count', async () => {
    const a = new FakeTransport();
    const h = new DataChannelHandler(asTransport(a), { activateFallback: vi.fn() });
    let done = false;
    void h.send(bytes(CHUNK_SIZE * 2)).then(() => (done = true));
    await new Promise((r) => setTimeout(r, 0));
    a.fire('data', encodeAckFrame(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(done).toBe(false);
    a.fire('data', encodeAckFrame(2));
    await new Promise((r) => setTimeout(r, 0));
    expect(done).toBe(true);
  });
});
