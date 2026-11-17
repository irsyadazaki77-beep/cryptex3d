/**
 * Audio steganography for Horcrux shard 2: a lossless 16-bit PCM WAV carrier whose sample
 * LSBs hold the shard. Pure TypeScript, no Web Audio, so it runs in the stego worker and in
 * tests. The bitstream is the same framed format as the PNG carrier (magic + length + payload
 * + SHA-256), so extraction verifies magic and checksum before anything is trusted.
 *
 * The carrier is a synthesized "crystal drone" (a slow, detuned chord) with TPDF dither drawn
 * from `crypto.getRandomValues`. Dither makes the sample LSBs uniformly random before embedding,
 * so writing ciphertext bits into them leaves no statistical tell. Never re-encode the WAV
 * (MP3, resampling, volume change): any lossy step destroys the payload.
 */
import {
  CarrierCapacityError,
  MAX_PAYLOAD_BYTES,
  PayloadTooLargeError,
  buildBitstream,
  bitstreamSize,
  BadMagicError,
  ChecksumFailError,
  HEADER_SIZE,
  hasValidMagic,
  parseBitstream,
  readPayloadLength,
} from './BitstreamLayout';
import { overwriteWithRandom } from '../shared/secureWipe';

export const WAV_SAMPLE_RATE = 44_100;
export const WAV_HEADER_BYTES = 44;
/** The drone never gets shorter than this, so tiny shards still sound like a track. */
export const MIN_DRONE_SECONDS = 8;

export class InvalidWavError extends Error {
  readonly code = 'INVALID_INPUT';
  constructor() {
    super('Not a supported 16-bit PCM WAV file');
    this.name = 'InvalidWavError';
  }
}

export interface WavInfo {
  /** Byte offset of the first sample. */
  dataOffset: number;
  /** Total 16-bit samples across all channels. */
  sampleCount: number;
  sampleRate: number;
  channels: number;
}

/** Bits available for payload in a WAV with `sampleCount` samples (1 bit per sample). */
export function wavCapacityBits(sampleCount: number): number {
  return Math.max(0, Math.floor(sampleCount));
}

/** Samples needed to carry a payload of `payloadBytes` (excluding the minimum-length rule). */
export function samplesForPayload(payloadBytes: number): number {
  return bitstreamSize(payloadBytes) * 8;
}

/** Writes a mono 16-bit PCM WAV from samples. */
export function buildWav(samples: Int16Array, sampleRate: number = WAV_SAMPLE_RATE): Uint8Array {
  const dataBytes = samples.length * 2;
  const out = new Uint8Array(WAV_HEADER_BYTES + dataBytes);
  const v = new DataView(out.buffer);
  const tag = (off: number, s: string): void => {
    for (let i = 0; i < 4; i++) out[off + i] = s.charCodeAt(i);
  };
  tag(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  tag(36, 'data');
  v.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(WAV_HEADER_BYTES + i * 2, samples[i], true);
  return out;
}

/**
 * Parses RIFF chunks and returns where the 16-bit PCM samples are.
 * @throws InvalidWavError for anything other than uncompressed 16-bit PCM
 */
export function parseWav(wav: Uint8Array): WavInfo {
  if (wav.length < WAV_HEADER_BYTES) throw new InvalidWavError();
  const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const tag = (off: number): string => String.fromCharCode(wav[off], wav[off + 1], wav[off + 2], wav[off + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new InvalidWavError();
  let off = 12;
  let fmt: { channels: number; rate: number } | null = null;
  while (off + 8 <= wav.length) {
    const id = tag(off);
    const size = v.getUint32(off + 4, true);
    const body = off + 8;
    if (id === 'fmt ') {
      if (size < 16 || body + 16 > wav.length) throw new InvalidWavError();
      const format = v.getUint16(body, true);
      const channels = v.getUint16(body + 2, true);
      const bits = v.getUint16(body + 14, true);
      if (format !== 1 || bits !== 16 || channels < 1) throw new InvalidWavError();
      fmt = { channels, rate: v.getUint32(body + 4, true) };
    } else if (id === 'data') {
      if (!fmt) throw new InvalidWavError();
      const bytes = Math.min(size, wav.length - body);
      return {
        dataOffset: body,
        sampleCount: Math.floor(bytes / 2),
        sampleRate: fmt.rate,
        channels: fmt.channels,
      };
    }
    off = body + size + (size & 1); // chunks are word-aligned
  }
  throw new InvalidWavError();
}

/** TPDF dither in [-1, 1] from two random bytes per sample. */
function ditherFor(count: number): Float32Array {
  const raw = new Uint8Array(count * 2);
  overwriteWithRandom(raw);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) out[i] = (raw[i * 2] - raw[i * 2 + 1]) / 255;
  raw.fill(0);
  return out;
}

/**
 * Synthesizes the crystal drone: F3 + C4 (slowly detuned) + G4 + a shimmering octave, with
 * fades at both ends and uniformly random LSBs from dither.
 */
export function synthesizeCrystalDrone(sampleCount: number, sampleRate: number = WAV_SAMPLE_RATE): Int16Array {
  const n = Math.max(1, Math.floor(sampleCount));
  const dither = ditherFor(n);
  const out = new Int16Array(n);
  const tau = Math.PI * 2;
  const fade = Math.min(sampleRate * 0.4, n / 2);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, i / fade, (n - 1 - i) / fade);
    const chord =
      0.3 * Math.sin(tau * 174.61 * t) +
      0.22 * Math.sin(tau * 261.63 * t + 0.7 * Math.sin(tau * 0.11 * t)) +
      0.16 * Math.sin(tau * 392.0 * t) +
      0.08 * Math.sin(tau * 1046.5 * t) * (0.5 + 0.5 * Math.sin(tau * 0.35 * t));
    const s = Math.round(chord * 9000 * env + dither[i]);
    out[i] = Math.max(-32768, Math.min(32767, s));
  }
  return out;
}

/** Synthesizes a drone just long enough to hold `payloadBytes` and returns it as WAV bytes. */
export function synthesizeCarrierFor(payloadBytes: number): Uint8Array {
  const needed = samplesForPayload(payloadBytes);
  const samples = Math.max(needed, MIN_DRONE_SECONDS * WAV_SAMPLE_RATE);
  return buildWav(synthesizeCrystalDrone(samples));
}

/**
 * Embeds `payload` into the LSB of each sample, MSB-first. The input is not mutated.
 * @throws PayloadTooLargeError, CarrierCapacityError, InvalidWavError
 */
export function embedInWav(wav: Uint8Array, payload: Uint8Array): Uint8Array {
  if (payload.byteLength > MAX_PAYLOAD_BYTES) throw new PayloadTooLargeError(payload.byteLength);
  const info = parseWav(wav);
  const bits = buildBitstream(payload);
  const required = bits.byteLength * 8;
  const available = wavCapacityBits(info.sampleCount);
  if (required > available) throw new CarrierCapacityError(required, available);
  const out = new Uint8Array(wav);
  for (let k = 0; k < required; k++) {
    const bit = (bits[k >> 3] >> (7 - (k & 7))) & 1;
    const at = info.dataOffset + k * 2; // low byte of a little-endian sample
    out[at] = (out[at] & 0xfe) | bit;
  }
  return out;
}

function readBytes(wav: Uint8Array, info: WavInfo, byteCount: number): Uint8Array {
  const out = new Uint8Array(byteCount);
  const total = byteCount * 8;
  for (let k = 0; k < total; k++) {
    out[k >> 3] |= (wav[info.dataOffset + k * 2] & 1) << (7 - (k & 7));
  }
  return out;
}

/**
 * Extracts and verifies the payload. Returned only after magic and SHA-256 both verify.
 * @throws BadMagicError, ChecksumFailError, InvalidWavError
 */
export function extractFromWav(wav: Uint8Array): Uint8Array {
  const info = parseWav(wav);
  const available = wavCapacityBits(info.sampleCount);
  if (available < HEADER_SIZE * 8) throw new BadMagicError();
  const header = readBytes(wav, info, HEADER_SIZE);
  if (!hasValidMagic(header)) throw new BadMagicError();
  const length = readPayloadLength(header);
  if (length > MAX_PAYLOAD_BYTES || bitstreamSize(length) * 8 > available) throw new ChecksumFailError();
  return parseBitstream(readBytes(wav, info, bitstreamSize(length)));
}
