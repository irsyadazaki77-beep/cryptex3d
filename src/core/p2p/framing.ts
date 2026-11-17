/**
 * Pure framing for chunked DataChannel transfers. No I/O, no crypto.
 *
 * Frame layouts (all integers big-endian uint32):
 *   START: [0x01][totalLength:4][chunkCount:4]
 *   DATA : [0x02][chunkIndex:4][payload...]
 *   ACK  : [0x03][chunksReceived:4]
 */

export const CHUNK_SIZE = 16 * 1024;

export const FRAME_START = 0x01;
export const FRAME_DATA = 0x02;
export const FRAME_ACK = 0x03;

export type Frame =
  | { type: 'start'; totalLength: number; chunkCount: number }
  | { type: 'data'; index: number; payload: Uint8Array }
  | { type: 'ack'; chunksReceived: number };

export class FramingError extends Error {
  constructor(
    public readonly code: 'MALFORMED_FRAME' | 'CHUNK_OUT_OF_RANGE' | 'CHUNK_SIZE_MISMATCH' | 'NO_START',
    message: string,
  ) {
    super(message);
    this.name = 'FramingError';
  }
}

export function chunkCountFor(totalLength: number, chunkSize = CHUNK_SIZE): number {
  return Math.ceil(totalLength / chunkSize);
}

function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, false);
}

export function encodeStartFrame(totalLength: number, chunkCount: number): Uint8Array {
  const out = new Uint8Array(9);
  const v = new DataView(out.buffer);
  out[0] = FRAME_START;
  writeU32(v, 1, totalLength);
  writeU32(v, 5, chunkCount);
  return out;
}

export function encodeDataFrame(index: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(5 + payload.length);
  out[0] = FRAME_DATA;
  writeU32(new DataView(out.buffer), 1, index);
  out.set(payload, 5);
  return out;
}

export function encodeAckFrame(chunksReceived: number): Uint8Array {
  const out = new Uint8Array(5);
  out[0] = FRAME_ACK;
  writeU32(new DataView(out.buffer), 1, chunksReceived);
  return out;
}

/** Returns null for frames that are not part of this protocol. */
export function decodeFrame(bytes: Uint8Array): Frame | null {
  if (bytes.length < 5) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  switch (bytes[0]) {
    case FRAME_START:
      if (bytes.length !== 9) return null;
      return { type: 'start', totalLength: v.getUint32(1, false), chunkCount: v.getUint32(5, false) };
    case FRAME_DATA:
      return { type: 'data', index: v.getUint32(1, false), payload: bytes.subarray(5) };
    case FRAME_ACK:
      if (bytes.length !== 5) return null;
      return { type: 'ack', chunksReceived: v.getUint32(1, false) };
    default:
      return null;
  }
}

/** Splits data into the START frame followed by DATA frames (each payload <= chunkSize). */
export function chunkData(data: Uint8Array, chunkSize = CHUNK_SIZE): Uint8Array[] {
  const count = chunkCountFor(data.length, chunkSize);
  const frames: Uint8Array[] = [encodeStartFrame(data.length, count)];
  for (let i = 0; i < count; i++) {
    frames.push(encodeDataFrame(i, data.subarray(i * chunkSize, (i + 1) * chunkSize)));
  }
  return frames;
}

/** Reassembles chunks in index order; tolerates out-of-order and duplicate delivery. */
export class Reassembler {
  private chunks: Uint8Array[] = [];
  private received = 0;
  private bytes = 0;
  private started = false;
  private totalLength = 0;
  private chunkCount = 0;

  constructor(private readonly chunkSize = CHUNK_SIZE) {}

  get isStarted(): boolean {
    return this.started;
  }
  get chunksReceived(): number {
    return this.received;
  }
  get bytesReceived(): number {
    return this.bytes;
  }
  get total(): number {
    return this.totalLength;
  }
  get isComplete(): boolean {
    return this.started && this.received === this.chunkCount;
  }

  start(totalLength: number, chunkCount: number): void {
    if (chunkCount !== chunkCountFor(totalLength, this.chunkSize)) {
      throw new FramingError('MALFORMED_FRAME', 'Chunk count does not match total length');
    }
    this.chunks = new Array<Uint8Array>(chunkCount);
    this.received = 0;
    this.bytes = 0;
    this.totalLength = totalLength;
    this.chunkCount = chunkCount;
    this.started = true;
  }

  addChunk(index: number, payload: Uint8Array): void {
    if (!this.started) throw new FramingError('NO_START', 'Data frame before start frame');
    if (index >= this.chunkCount) throw new FramingError('CHUNK_OUT_OF_RANGE', 'Chunk index out of range');
    const expected =
      index === this.chunkCount - 1 ? this.totalLength - index * this.chunkSize : this.chunkSize;
    if (payload.length !== expected) {
      throw new FramingError('CHUNK_SIZE_MISMATCH', 'Unexpected chunk length');
    }
    if (this.chunks[index]) return; // duplicate
    this.chunks[index] = payload.slice();
    this.received++;
    this.bytes += payload.length;
  }

  /** Concatenated payload; only valid once isComplete. */
  assemble(): Uint8Array {
    if (!this.isComplete) throw new FramingError('MALFORMED_FRAME', 'Transfer incomplete');
    const out = new Uint8Array(this.totalLength);
    let offset = 0;
    for (const c of this.chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }
}
