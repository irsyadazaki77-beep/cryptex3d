import { create } from 'zustand';
import type {
  AuditReport,
  P2PStatus,
  PipelineState,
  PipelineStatus,
  SpatialKeySnapshot,
} from './types';

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
  }): Promise<void>;
  extractDecrypt(args: {
    passphrase: string;
    spatialKeySnapshot: SpatialKeySnapshot;
    carrier: Uint8Array;
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
  lastError: string | null;
}

export interface VaultActions {
  setSpatialKeySnapshot: (snapshot: SpatialKeySnapshot) => void;
  dispatchEncryptEmbed: (file: Uint8Array, passphrase: string) => Promise<void>;
  dispatchExtractDecrypt: (passphrase: string) => Promise<void>;
  setAuditReport: (report: AuditReport | null) => void;
  setAuditFailed: (failed: boolean) => void;
  setAdvancedAudit: (enabled: boolean) => void;
  setP2PStatus: (status: P2PStatus) => void;
  setStegoCarrier: (carrier: Uint8Array | null) => void;
  setDecryptedPayload: (payload: Uint8Array | null) => void;
  setLastError: (message: string | null) => void;
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

/** Only worker-supplied error codes/messages are kept; never raw Error text. */
function safeMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return PIPELINE_FAIL_MESSAGE;
}

export const useVaultStore = create<VaultStore>()((set, get) => ({
  spatialKeySnapshot: null,
  encryptStatus: idlePipelineStatus(),
  decryptStatus: idlePipelineStatus(),
  auditReport: null,
  auditFailed: false,
  advancedAudit: false,
  p2pStatus: idleP2PStatus(),
  stegoCarrier: null,
  decryptedPayload: null,
  lastError: null,

  setSpatialKeySnapshot: (snapshot) => set({ spatialKeySnapshot: snapshot }),
  setAuditReport: (report) => set({ auditReport: report }),
  setAuditFailed: (failed) => set({ auditFailed: failed }),
  setAdvancedAudit: (enabled) => set({ advancedAudit: enabled }),
  setP2PStatus: (status) => set({ p2pStatus: status }),
  setStegoCarrier: (carrier) => set({ stegoCarrier: carrier }),
  setDecryptedPayload: (payload) => set({ decryptedPayload: payload }),
  setLastError: (message) => set({ lastError: message }),

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

  dispatchEncryptEmbed: async (file, passphrase) => {
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
      await runner.encryptEmbed({
        file,
        passphrase,
        spatialKeySnapshot,
        // Empty carrier signals the runner to generate a default noise carrier.
        carrier: stegoCarrier ?? new Uint8Array(0),
      });
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
    } catch (err) {
      fail(safeMessage(err));
    }
  },
}));
