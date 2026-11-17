import { create } from 'zustand';
import type {
  AuditReport,
  EncryptOptions,
  HorcruxShardSet,
  LoadedShard,
  P2PStatus,
  PipelineState,
  PipelineStatus,
  SpatialKeySnapshot,
} from './types';
import { overwriteWithRandom } from '../core/shared/secureWipe';
import {
  idleTripwire,
  nextFailureCount,
  shouldTrip,
  type TripReason,
  type TripwireState,
} from './tripwire';

export type PipelineKind = 'encrypt' | 'decrypt';

/**
 * Orchestrates the worker pipelines. Registered by the worker layer
 * (task 12+) so the store never imports workers, Three.js, or React.
 * Passphrases are passed through as call arguments and never stored.
 */
export interface PipelineRunner {
  encryptEmbed(args: {
    file: Uint8Array;
    passphrase: string;
    spatialKeySnapshot: SpatialKeySnapshot;
    carrier: Uint8Array;
    /** Self-destruct after this many milliseconds (optional). */
    ttlMs?: number;
  }): Promise<void>;
  extractDecrypt(args: {
    passphrase: string;
    spatialKeySnapshot: SpatialKeySnapshot;
    carrier: Uint8Array;
  }): Promise<void>;
  /** Horcrux Mode: 2-of-3 split across a PNG, a WAV and a ring-bound token. */
  sealHorcrux(args: {
    file: Uint8Array;
    passphrase: string;
    spatialKeySnapshot: SpatialKeySnapshot;
    ttlMs?: number;
  }): Promise<void>;
  /** Recover from any two loaded shards. */
  recoverHorcrux(args: {
    passphrase: string;
    spatialKeySnapshot: SpatialKeySnapshot;
    shards: readonly LoadedShard[];
  }): Promise<void>;
}

let runner: PipelineRunner | null = null;

export function registerPipelineRunner(r: PipelineRunner | null): void {
  runner = r;
}

export const idlePipelineStatus = (): PipelineStatus => ({
  state: 'idle',
  progressBytes: 0,
  totalBytes: 0,
});

export const idleP2PStatus = (): P2PStatus => ({
  mode: 'idle',
  connectionState: 'idle',
  transferredBytes: 0,
  totalBytes: 0,
});

/** Horcrux recovery needs two of the three shards. */
export const MAX_LOADED_SHARDS = 3;

export interface VaultState {
  spatialKeySnapshot: SpatialKeySnapshot | null;
  encryptStatus: PipelineStatus;
  decryptStatus: PipelineStatus;
  auditReport: AuditReport | null;
  /** True when the last audit attempt failed (advisory; pipeline still succeeds). */
  auditFailed: boolean;
  /** Opt-in flag forwarded to the auditor worker. */
  advancedAudit: boolean;
  p2pStatus: P2PStatus;
  stegoCarrier: Uint8Array | null;
  decryptedPayload: Uint8Array | null;
  /** Expiry of the last successfully decrypted drop (epoch ms), or null. */
  decryptExpiresAt: number | null;
  lastError: string | null;
  /** Shards produced by the last Horcrux encryption (exportable, ciphertext only). */
  horcruxShards: HorcruxShardSet | null;
  /** Shard files the user loaded for Horcrux recovery. */
  decryptShards: LoadedShard[];
  tripwire: TripwireState;
}

export interface VaultActions {
  setSpatialKeySnapshot: (snapshot: SpatialKeySnapshot) => void;
  dispatchEncryptEmbed: (
    file: Uint8Array,
    passphrase: string,
    options?: EncryptOptions,
  ) => Promise<void>;
  dispatchExtractDecrypt: (passphrase: string) => Promise<void>;
  dispatchHorcruxRecover: (passphrase: string) => Promise<void>;
  setAuditReport: (report: AuditReport | null) => void;
  setAuditFailed: (failed: boolean) => void;
  setAdvancedAudit: (enabled: boolean) => void;
  setP2PStatus: (status: P2PStatus) => void;
  setStegoCarrier: (carrier: Uint8Array | null) => void;
  setDecryptedPayload: (payload: Uint8Array | null) => void;
  setDecryptExpiresAt: (expiresAt: number | null) => void;
  setLastError: (message: string | null) => void;
  setHorcruxShards: (shards: HorcruxShardSet | null) => void;
  addDecryptShard: (shard: Omit<LoadedShard, 'id'>) => void;
  removeDecryptShard: (id: string) => void;
  clearDecryptShards: () => void;
  /** Overwrites in-memory carrier, shard and payload buffers with random bytes, then drops them. */
  wipeDecryptBuffers: () => void;
  setPipelineState: (
    pipeline: PipelineKind,
    state: PipelineState,
    progress?: { progressBytes: number; totalBytes: number },
  ) => void;
}

export type VaultStore = VaultState & VaultActions;

const NO_RUNNER_MESSAGE = 'Pipeline workers are not initialised.';
const NO_SNAPSHOT_MESSAGE = 'Set the artifact configuration before continuing.';
const NO_CARRIER_MESSAGE = 'No carrier is available.';
const PIPELINE_FAIL_MESSAGE = 'Pipeline operation failed.';
const NEED_SHARDS_CODE = 'INSUFFICIENT_SHARDS';

/** Only worker-supplied error codes/messages are kept; never raw Error text. */
function safeMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return PIPELINE_FAIL_MESSAGE;
}

let shardCounter = 0;

export const useVaultStore = create<VaultStore>()((set, get) => {
  /** Fires the self-destruct: wipe buffers, mark tripped, surface a fixed error code. */
  const trip = (reason: TripReason): void => {
    get().wipeDecryptBuffers();
    set({
      tripwire: { failures: 0, tripped: true, reason },
      lastError: reason === 'expired' ? 'EXPIRED' : 'TRIPWIRE',
      decryptStatus: { state: 'error', progressBytes: 0, totalBytes: 0 },
    });
  };

  /** Counts consecutive authentication failures; an expired drop self-destructs immediately. */
  const registerDecryptOutcome = (code: string | null): void => {
    if (code === 'EXPIRED') {
      trip('expired');
      return;
    }
    const failures = nextFailureCount(get().tripwire.failures, code);
    if (shouldTrip(failures)) trip('tripwire');
    else set((s) => ({ tripwire: { ...s.tripwire, failures } }));
  };

  return {
    spatialKeySnapshot: null,
    encryptStatus: idlePipelineStatus(),
    decryptStatus: idlePipelineStatus(),
    auditReport: null,
    auditFailed: false,
    advancedAudit: false,
    p2pStatus: idleP2PStatus(),
    stegoCarrier: null,
    decryptedPayload: null,
    decryptExpiresAt: null,
    lastError: null,
    horcruxShards: null,
    decryptShards: [],
    tripwire: idleTripwire(),
    setSpatialKeySnapshot: (snapshot) => set({ spatialKeySnapshot: snapshot }),
    setAuditReport: (report) => set({ auditReport: report }),
    setAuditFailed: (failed) => set({ auditFailed: failed }),
    setAdvancedAudit: (enabled) => set({ advancedAudit: enabled }),
    setP2PStatus: (status) => set({ p2pStatus: status }),
    // Loading a fresh carrier starts a fresh attempt streak.
    setStegoCarrier: (carrier) =>
      set(carrier ? { stegoCarrier: carrier, tripwire: idleTripwire() } : { stegoCarrier: carrier }),
    setDecryptedPayload: (payload) => set({ decryptedPayload: payload }),
    setDecryptExpiresAt: (expiresAt) => set({ decryptExpiresAt: expiresAt }),
    setLastError: (message) => set({ lastError: message }),
    setHorcruxShards: (shards) => set({ horcruxShards: shards }),
    addDecryptShard: (shard) =>
      set((s) => {
        // One shard per medium: a newly loaded file replaces an earlier one of the same kind.
        const kept = s.decryptShards.filter((x) => x.kind !== shard.kind);
        const next = [...kept, { ...shard, id: `shard-${++shardCounter}` }].slice(-MAX_LOADED_SHARDS);
        return { decryptShards: next, tripwire: idleTripwire() };
      }),
    removeDecryptShard: (id) => {
      const gone = get().decryptShards.find((x) => x.id === id);
      if (gone) overwriteWithRandom(gone.bytes);
      set((s) => ({ decryptShards: s.decryptShards.filter((x) => x.id !== id) }));
    },
    clearDecryptShards: () => {
      for (const sh of get().decryptShards) overwriteWithRandom(sh.bytes);
      set({ decryptShards: [] });
    },
    wipeDecryptBuffers: () => {
      const s = get();
      if (s.stegoCarrier) overwriteWithRandom(s.stegoCarrier);
      for (const sh of s.decryptShards) overwriteWithRandom(sh.bytes);
      if (s.decryptedPayload) overwriteWithRandom(s.decryptedPayload);
      set({ stegoCarrier: null, decryptShards: [], decryptedPayload: null, decryptExpiresAt: null });
    },
    setPipelineState: (pipeline, state, progress) => {
      const key = pipeline === 'encrypt' ? 'encryptStatus' : 'decryptStatus';
      set((s) => ({
        [key]: {
          state,
          progressBytes: progress?.progressBytes ?? s[key].progressBytes,
          totalBytes: progress?.totalBytes ?? s[key].totalBytes,
        },
      }));
    },
    dispatchEncryptEmbed: async (file, passphrase, options) => {
      const { spatialKeySnapshot, stegoCarrier, setPipelineState, setLastError } = get();
      setLastError(null);
      const fail = (msg: string): void => {
        setLastError(msg);
        setPipelineState('encrypt', 'error');
      };
      if (!runner) return fail(NO_RUNNER_MESSAGE);
      if (!spatialKeySnapshot) return fail(NO_SNAPSHOT_MESSAGE);
      setPipelineState('encrypt', 'deriving', { progressBytes: 0, totalBytes: file.length });
      try {
        if (options?.horcrux) {
          await runner.sealHorcrux({
            file,
            passphrase,
            spatialKeySnapshot,
            ttlMs: options.ttlMs,
          });
        } else {
          await runner.encryptEmbed({
            file,
            passphrase,
            spatialKeySnapshot,
            // Empty carrier signals the runner to generate a default noise carrier.
            carrier: stegoCarrier ?? new Uint8Array(0),
            ttlMs: options?.ttlMs,
          });
        }
      } catch (err) {
        fail(safeMessage(err));
      }
    },
    dispatchExtractDecrypt: async (passphrase) => {
      const { spatialKeySnapshot, stegoCarrier, setPipelineState, setLastError } = get();
      setLastError(null);
      const fail = (msg: string): void => {
        setLastError(msg);
        setPipelineState('decrypt', 'error');
      };
      if (!runner) return fail(NO_RUNNER_MESSAGE);
      if (!spatialKeySnapshot) return fail(NO_SNAPSHOT_MESSAGE);
      if (!stegoCarrier) return fail(NO_CARRIER_MESSAGE);
      setPipelineState('decrypt', 'extracting', { progressBytes: 0, totalBytes: 0 });
      try {
        await runner.extractDecrypt({
          passphrase,
          spatialKeySnapshot,
          carrier: stegoCarrier,
        });
        registerDecryptOutcome(null);
      } catch (err) {
        const code = safeMessage(err);
        fail(code);
        registerDecryptOutcome(code);
      }
    },
    dispatchHorcruxRecover: async (passphrase) => {
      const { spatialKeySnapshot, decryptShards, setPipelineState, setLastError } = get();
      setLastError(null);
      const fail = (msg: string): void => {
        setLastError(msg);
        setPipelineState('decrypt', 'error');
      };
      if (!runner) return fail(NO_RUNNER_MESSAGE);
      if (!spatialKeySnapshot) return fail(NO_SNAPSHOT_MESSAGE);
      if (decryptShards.length < 2) return fail(NEED_SHARDS_CODE);
      setPipelineState('decrypt', 'extracting', { progressBytes: 0, totalBytes: 0 });
      try {
        await runner.recoverHorcrux({
          passphrase,
          spatialKeySnapshot,
          shards: decryptShards,
        });
        registerDecryptOutcome(null);
      } catch (err) {
        const code = safeMessage(err);
        fail(code);
        registerDecryptOutcome(code);
      }
    },
  };
});
