/**
 * WorkerManager: lazy, idle-terminating wrapper around a dedicated Worker.
 *
 * - The Worker is created on the first outgoing message.
 * - Every message sent or received resets the idle timer (default 30 s).
 * - On idle timeout the Worker is terminated; the next outgoing message
 *   transparently starts a fresh one. The timeout never fires while requests
 *   are in flight (it re-arms instead), so no request is dropped by idling.
 * - If the Worker crashes (`error` / `messageerror`) or `terminate()` is called
 *   explicitly, all pending requests reject with a WorkerRequestError.
 *
 * Passphrases and plaintext only travel inside message fields. Nothing is logged
 * and error text never includes message contents.
 */
import type { WorkerErrorCode, WorkerMessage } from '../store/types';

export const DEFAULT_IDLE_MS = 30_000;

/** Injectable timer functions so idle behaviour is testable with fake timers. */
export interface TimerApi {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

const defaultTimers: TimerApi = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

export type WorkerSource = string | URL | (() => Worker);

export interface ManagedWorkerOptions {
  idleMs?: number;
  timers?: TimerApi;
}

export type WorkerRequestErrorCode = WorkerErrorCode | 'WORKER_TERMINATED' | 'WORKER_CRASHED';

/** Carries a code only (the store surfaces `err.code`). */
export class WorkerRequestError extends Error {
  readonly code: WorkerRequestErrorCode;
  constructor(code: WorkerRequestErrorCode) {
    super(code);
    this.name = 'WorkerRequestError';
    this.code = code;
  }
}

export type RequestMessage = Extract<WorkerMessage, { kind: 'request' }>;
export type ResponseMessage = Extract<WorkerMessage, { kind: 'response' }>;

export interface RequestOptions {
  transfer?: Transferable[];
  onProgress?: (progressBytes: number, totalBytes: number) => void;
}

export interface ManagedWorker {
  /** True while a Worker instance exists. */
  readonly isAlive: boolean;
  /** Number of requests awaiting a response. */
  readonly pendingCount: number;
  /** Fire-and-forget send; starts the Worker if needed. */
  post(msg: WorkerMessage, transfer?: Transferable[]): void;
  /** Send a request and resolve with the matching response payload. */
  request<TRes = unknown>(msg: RequestMessage, opts?: RequestOptions): Promise<TRes>;
  /** Subscribe to every message received from the Worker. */
  onMessage(listener: (msg: WorkerMessage) => void): () => void;
  /** Terminate now, rejecting pending requests. A later send restarts the Worker. */
  terminate(): void;
}

interface Pending {
  resolve: (payload: unknown) => void;
  reject: (err: WorkerRequestError) => void;
  onProgress?: (progressBytes: number, totalBytes: number) => void;
}

export function createManagedWorker(
  source: WorkerSource,
  options: ManagedWorkerOptions = {},
): ManagedWorker {
  const idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
  const timers = options.timers ?? defaultTimers;
  const factory: () => Worker =
    typeof source === 'function' ? source : () => new Worker(source, { type: 'module' });

  let worker: Worker | null = null;
  let idleHandle: unknown = null;
  const pending = new Map<string, Pending>();
  const listeners = new Set<(msg: WorkerMessage) => void>();

  const clearIdle = (): void => {
    if (idleHandle !== null) {
      timers.clearTimeout(idleHandle);
      idleHandle = null;
    }
  };

  const rejectAll = (code: WorkerRequestErrorCode): void => {
    const all = [...pending.values()];
    pending.clear();
    for (const p of all) p.reject(new WorkerRequestError(code));
  };

  const kill = (): void => {
    clearIdle();
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
      worker = null;
    }
  };

  const armIdle = (): void => {
    clearIdle();
    idleHandle = timers.setTimeout(() => {
      idleHandle = null;
      if (pending.size > 0) {
        armIdle(); // never idle-kill in-flight work
        return;
      }
      kill();
    }, idleMs);
  };

  const handleMessage = (ev: MessageEvent<WorkerMessage>): void => {
    armIdle();
    const msg = ev.data;
    for (const l of [...listeners]) l(msg);
    if (!msg || typeof msg !== 'object') return;
    const p = pending.get(msg.id);
    if (!p) return;
    if (msg.kind === 'progress') {
      p.onProgress?.(msg.progressBytes, msg.totalBytes);
    } else if (msg.kind === 'response') {
      pending.delete(msg.id);
      p.resolve(msg.payload);
    } else if (msg.kind === 'error') {
      pending.delete(msg.id);
      p.reject(new WorkerRequestError(msg.code));
    }
  };

  const crash = (): void => {
    kill();
    rejectAll('WORKER_CRASHED');
  };

  const ensure = (): Worker => {
    if (worker) return worker;
    const w = factory();
    w.onmessage = handleMessage;
    w.onerror = crash;
    w.onmessageerror = crash;
    worker = w;
    return w;
  };

  const send = (msg: WorkerMessage, transfer?: Transferable[]): void => {
    const w = ensure();
    armIdle();
    if (transfer && transfer.length > 0) w.postMessage(msg, transfer);
    else w.postMessage(msg);
  };

  return {
    get isAlive() {
      return worker !== null;
    },
    get pendingCount() {
      return pending.size;
    },
    post: send,
    request<TRes = unknown>(msg: RequestMessage, opts: RequestOptions = {}): Promise<TRes> {
      return new Promise<TRes>((resolve, reject) => {
        if (pending.has(msg.id)) {
          reject(new WorkerRequestError('INVALID_INPUT'));
          return;
        }
        pending.set(msg.id, {
          resolve: resolve as (p: unknown) => void,
          reject,
          onProgress: opts.onProgress,
        });
        try {
          send(msg, opts.transfer);
        } catch {
          pending.delete(msg.id);
          reject(new WorkerRequestError('INTERNAL'));
        }
      });
    },
    onMessage(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    terminate() {
      kill();
      rejectAll('WORKER_TERMINATED');
    },
  };
}
