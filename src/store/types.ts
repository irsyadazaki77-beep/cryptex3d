/**
 * Shared store and worker-protocol types for Cryptex3D.
 * No passphrases, key material, or plaintext appear in any store-facing type.
 */

export type PipelineState =
  | 'idle'
  | 'deriving'
  | 'encrypting'
  | 'embedding'
  | 'auditing'
  | 'transferring'
  | 'extracting'
  | 'decrypting'
  | 'complete'
  | 'error';

export interface SpatialKeySnapshot {
  monolithRotationX: number;
  monolithRotationY: number;
  monolithRotationZ: number;
  /** Ring segment positions, each 0-9. */
  ringSegmentPositions: number[];
  crystalActivated: boolean;
  /** SHA-256 of the fields above, 64-char lowercase hex. */
  serializedHash: string;
}

export interface PipelineStatus {
  state: PipelineState;
  progressBytes: number;
  totalBytes: number;
}

export interface AuditReport {
  /** Detectability score, 0-100. */
  score: number;
  warnings: string[];
  recommendation: string;
  shannonEntropy: number;
  chiSquarePValue: number;
  /** RS-estimated fraction of LSB-embedded samples, 0-1 (payload density estimate). */
  lsbPairAnomaly?: number;
}

export type P2PMode =
  | 'idle'
  | 'webrtc-offer-pending'
  | 'webrtc-connected'
  | 'broadcast-listening'
  | 'broadcast-received';

export type P2PConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'transferring'
  | 'disconnected'
  | 'failed';

export interface P2PStatus {
  mode: P2PMode;
  connectionState: P2PConnectionState;
  transferredBytes: number;
  totalBytes: number;
}

export interface EncryptionBundle {
  /** 12 bytes, random per encrypt call. */
  iv: Uint8Array;
  /** 16 bytes, derived from passphrase + spatial key hash. */
  salt: Uint8Array;
  ciphertext: Uint8Array;
  /** 16-byte AES-GCM authentication tag. */
  tag: Uint8Array;
}

/** Typed error codes surfaced by workers. Contain no sensitive data. */
export type WorkerErrorCode =
  | 'AUTH_FAIL'
  | 'INVALID_PASSPHRASE'
  | 'CHECKSUM_FAIL'
  | 'MAGIC_FAIL'
  | 'BAD_MAGIC'
  | 'CARRIER_CAPACITY_EXCEEDED'
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_INPUT'
  | 'AUDIT_FAIL'
  | 'EXPIRED'
  | 'INSUFFICIENT_SHARDS'
  | 'HORCRUX_TOO_LARGE'
  | 'INTERNAL';

export type WorkerTarget = 'crypto' | 'stego' | 'auditor';

/** Typed message envelope for all main-thread <-> worker traffic. */
export type WorkerMessage<TPayload = unknown> =
  | {
      kind: 'request';
      id: string;
      target: WorkerTarget;
      op: string;
      payload: TPayload;
    }
  | {
      kind: 'response';
      id: string;
      target: WorkerTarget;
      op: string;
      payload: TPayload;
    }
  | {
      kind: 'progress';
      id: string;
      target: WorkerTarget;
      op: string;
      progressBytes: number;
      totalBytes: number;
    }
  | {
      kind: 'error';
      id: string;
      target: WorkerTarget;
      op: string;
      code: WorkerErrorCode;
      message: string;
    };

export type ShardKind = 'png' | 'wav' | 'token';

/** A shard file loaded for recovery. `bytes` is wiped when the tripwire fires. */
export interface LoadedShard {
  id: string;
  kind: ShardKind;
  name: string;
  bytes: Uint8Array;
}

/** The three exportable shards produced by Horcrux Mode. */
export interface HorcruxShardSet {
  /** Shard 1: lossless PNG whose LSBs hold the shard (Obsidian Monolith). */
  monolithPng: Uint8Array;
  /** Shard 2: PCM WAV whose sample LSBs hold the shard (Ethereal Crystal). */
  crystalWav: Uint8Array;
  /** Shard 3: encrypted JSON token bound to the Cryptex Ring positions. */
  ringToken: Uint8Array;
  /** Hex id shared by the three shards. */
  setId: string;
  /** TTL as epoch milliseconds, or null for none. */
  expiresAt: number | null;
}

export interface EncryptOptions {
  /** Self-destruct after this many milliseconds. Omit for no expiry. */
  ttlMs?: number;
  /** Split the secret across PNG, WAV and a ring-bound token (2-of-3). */
  horcrux?: boolean;
}