import { describe, it, expect, vi } from 'vitest';
import {
  createManagedWorker,
  WorkerRequestError,
  type RequestMessage,
  type TimerApi,
} from '../../src/core/WorkerManager';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  sent: unknown[] = [];
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(m: unknown): void {
    this.sent.push(m);
  }
  terminate(): void {
    this.terminated = true;
  }
  emit(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

function makeTimers() {
  let now = 0;
  let nextHandle = 1;
  const tasks = new Map<number, { at: number; fn: () => void }>();
  const timers: TimerApi = {
    setTimeout: (fn, ms) => {
      const h = nextHandle++;
      tasks.set(h, { at: now + ms, fn });
      return h;
    },
    clearTimeout: (h) => {
      tasks.delete(h as number);
    },
  };
  const advance = (ms: number): void => {
    now += ms;
    for (const [h, t] of [...tasks]) {
      if (t.at <= now) {
        tasks.delete(h);
        t.fn();
      }
    }
  };
  return { timers, advance };
}

const mkReq = (id: string): RequestMessage => ({
  kind: 'request',
  id,
  target: 'crypto',
  op: 'encrypt',
  payload: {},
});

function setup() {
  FakeWorker.instances = [];
  const t = makeTimers();
  const mw = createManagedWorker(() => new FakeWorker() as unknown as Worker, {
    idleMs: 30_000,
    timers: t.timers,
  });
  return { mw, ...t };
}

describe('WorkerManager', () => {
  it('creates the worker lazily on first post', () => {
    const { mw } = setup();
    expect(FakeWorker.instances).toHaveLength(0);
    expect(mw.isAlive).toBe(false);
    mw.post(mkReq('a'));
    expect(FakeWorker.instances).toHaveLength(1);
    expect(mw.isAlive).toBe(true);
  });

  it('terminates after 30 s idle and restarts on next send', () => {
    const { mw, advance } = setup();
    mw.post(mkReq('a'));
    advance(29_999);
    expect(FakeWorker.instances[0].terminated).toBe(false);
    advance(1);
    expect(FakeWorker.instances[0].terminated).toBe(true);
    expect(mw.isAlive).toBe(false);
    mw.post(mkReq('b'));
    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances[1].sent).toHaveLength(1);
  });

  it('resets the idle timer on send and receive', () => {
    const { mw, advance } = setup();
    mw.post(mkReq('a'));
    advance(20_000);
    FakeWorker.instances[0].emit({ kind: 'response', id: 'x' });
    advance(20_000);
    expect(mw.isAlive).toBe(true);
    mw.post(mkReq('b'));
    advance(29_000);
    expect(mw.isAlive).toBe(true);
    advance(1_000);
    expect(mw.isAlive).toBe(false);
  });

  it('resolves request by id and does not idle-kill while pending', async () => {
    const { mw, advance } = setup();
    const p = mw.request<string>(mkReq('r1'));
    advance(60_000);
    expect(mw.isAlive).toBe(true);
    FakeWorker.instances[0].emit({
      kind: 'response',
      id: 'r1',
      target: 'crypto',
      op: 'encrypt',
      payload: 'ok',
    });
    await expect(p).resolves.toBe('ok');
    advance(30_000);
    expect(mw.isAlive).toBe(false);
  });

  it('rejects with the worker error code', async () => {
    const { mw } = setup();
    const p = mw.request(mkReq('r2'));
    FakeWorker.instances[0].emit({
      kind: 'error',
      id: 'r2',
      target: 'crypto',
      op: 'encrypt',
      code: 'AUTH_FAIL',
      message: 'x',
    });
    await expect(p).rejects.toMatchObject({ code: 'AUTH_FAIL' });
  });

  it('explicit terminate rejects pending requests; next send restarts', async () => {
    const { mw } = setup();
    const p = mw.request(mkReq('r3'));
    mw.terminate();
    await expect(p).rejects.toBeInstanceOf(WorkerRequestError);
    await expect(p).rejects.toMatchObject({ code: 'WORKER_TERMINATED' });
    mw.post(mkReq('r4'));
    expect(FakeWorker.instances).toHaveLength(2);
  });

  it('worker crash rejects pending and restarts on next send', async () => {
    const { mw } = setup();
    const p = mw.request(mkReq('r5'));
    FakeWorker.instances[0].onerror?.();
    await expect(p).rejects.toMatchObject({ code: 'WORKER_CRASHED' });
    expect(FakeWorker.instances[0].terminated).toBe(true);
    mw.post(mkReq('r6'));
    expect(FakeWorker.instances).toHaveLength(2);
  });

  it('notifies onMessage listeners', () => {
    const { mw } = setup();
    const fn = vi.fn();
    const off = mw.onMessage(fn);
    mw.post(mkReq('a'));
    FakeWorker.instances[0].emit({ kind: 'progress', id: 'z' });
    off();
    FakeWorker.instances[0].emit({ kind: 'progress', id: 'z' });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
