/**
 * Judge Demo Mode orchestration (Req 10.1-10.4).
 *
 * Pure-ish: all side effects (store, workers, BroadcastChannel) are injected via
 * DemoDeps so the sequence, timeout and comparison logic can be tested with fakes.
 * Nothing here logs the passphrase or payload.
 */

/** Overall deadline for a demo run (Req 10.4). */
export const DEMO_TIMEOUT_MS = 60_000;

/** Size of the fixed demo payload in bytes. */
export const DEMO_PAYLOAD_LENGTH = 1024;

/**
 * DEMO-ONLY PUBLIC CONSTANT. This passphrase is intentionally hard-coded and
 * publicly visible so Judge Demo Mode is reproducible. The spec allows this for
 * the demo only. It MUST NOT be used for real data or reused anywhere else.
 */
export const DEMO_PASSPHRASE = 'cryptex3d-public-demo-passphrase';

/** Fixed Spatial Key inputs for the demo (valid ranges per SpatialKeySerializer). */
export const DEMO_SPATIAL_KEY = {
  monolithRot: [45, 90, 135] as [number, number, number],
  ringSegments: [0, 1, 2, 3, 4, 5, 6, 7],
  crystalActivated: true,
} as const;

/** Deterministic 1 024-byte demo payload (no randomness). */
export function createDemoPayload(): Uint8Array {
  const out = new Uint8Array(DEMO_PAYLOAD_LENGTH);
  for (let i = 0; i < out.length; i++) out[i] = (i * 31 + 7) & 0xff;
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Coarse phases reported to the UI; the UI maps them to a stage label. */
export type DemoPhase = 'key' | 'encrypt' | 'transfer' | 'decrypt' | 'done';

export interface DemoDeps {
  /** Step 1: set the fixed SpatialKeySnapshot in the store. */
  setSpatialKey(): Promise<void>;
  /** Steps 2-4: encrypt, embed into a generated carrier, audit. Rejects on failure. */
  encryptEmbed(payload: Uint8Array, passphrase: string): Promise<void>;
  /** Step 5: move the stego carrier over BroadcastChannel and store the received copy. */
  transfer(signal: AbortSignal): Promise<void>;
  /** Steps 6-7: extract and decrypt. Resolves with the decrypted payload. */
  extractDecrypt(passphrase: string): Promise<Uint8Array>;
  /** Called on every phase transition. */
  onPhase(phase: DemoPhase): void;
  /** Called once when the deadline aborts the run, to release resources. */
  onAbort?(): void;
}

export type DemoResult =
  | { status: 'complete'; payload: Uint8Array; hex: string; matches: boolean }
  | { status: 'timeout' }
  | { status: 'error'; message: string };

export interface RunDemoOptions {
  timeoutMs?: number;
  passphrase?: string;
  payload?: Uint8Array;
}

const DEMO_FAIL_MESSAGE = 'Demo failed.';

function safeMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === 'string') return code;
  }
  if (err instanceof Error && /^[A-Z0-9_]{3,40}$/.test(err.message)) return err.message;
  return DEMO_FAIL_MESSAGE;
}

/**
 * Runs the full demo pipeline under a deadline. On deadline the AbortController
 * fires, deps.onAbort runs, remaining steps are skipped and 'timeout' is returned.
 */
export async function runDemo(deps: DemoDeps, options: RunDemoOptions = {}): Promise<DemoResult> {
  const timeoutMs = options.timeoutMs ?? DEMO_TIMEOUT_MS;
  const passphrase = options.passphrase ?? DEMO_PASSPHRASE;
  const original = options.payload ?? createDemoPayload();
  const controller = new AbortController();
  const { signal } = controller;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const aborted = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve('timeout');
    }, timeoutMs);
  });

  const steps = (async (): Promise<DemoResult> => {
    const guard = (): void => {
      if (signal.aborted) throw new Error('ABORTED');
    };
    deps.onPhase('key');
    await deps.setSpatialKey();
    guard();
    deps.onPhase('encrypt');
    await deps.encryptEmbed(original, passphrase);
    guard();
    deps.onPhase('transfer');
    await deps.transfer(signal);
    guard();
    deps.onPhase('decrypt');
    const decrypted = await deps.extractDecrypt(passphrase);
    guard();
    deps.onPhase('done');
    return {
      status: 'complete',
      payload: decrypted,
      hex: bytesToHex(decrypted),
      matches: bytesEqual(decrypted, original),
    };
  })().catch((err: unknown): DemoResult => {
    if (signal.aborted) return { status: 'timeout' };
    return { status: 'error', message: safeMessage(err) };
  });

  try {
    const winner = await Promise.race([steps, aborted]);
    if (winner === 'timeout') {
      deps.onAbort?.();
      return { status: 'timeout' };
    }
    return winner;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
