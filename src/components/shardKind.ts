import type { ShardKind } from '../store/types';

/**
 * Identifies a shard file by its magic bytes, never by its name:
 *   PNG  89 50 4E 47 0D 0A 1A 0A
 *   WAV  "RIFF" .... "WAVE"
 *   JSON first non-whitespace byte is "{"
 * Returns null for anything else. Pure; no crypto.
 */
export function detectShardKind(bytes: Uint8Array): ShardKind | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= png.length && png.every((b, i) => bytes[i] === b)) return 'png';
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45
  ) {
    return 'wav';
  }
  for (let i = 0; i < Math.min(bytes.length, 64); i++) {
    const c = bytes[i];
    if (c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09) continue;
    return c === 0x7b ? 'token' : null;
  }
  return null;
}

export const SHARD_LABEL: Record<ShardKind, string> = {
  png: 'Monolith PNG',
  wav: 'Crystal WAV',
  token: 'Ring token',
};

/** Largest shard file the UI will read into memory (the biggest legitimate one is ~1.1 MB). */
export const MAX_SHARD_FILE_BYTES = 8 * 1024 * 1024;
