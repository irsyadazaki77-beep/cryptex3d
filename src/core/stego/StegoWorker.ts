/**
 * StegoWorker: dedicated module Worker for LSB embed/extract on a 1024x1024 PNG carrier.
 * Must not import React or Three.js. Errors carry codes only; no payload bytes are logged.
 *
 * Spawn with: new Worker(new URL('./StegoWorker.ts', import.meta.url), { type: 'module' })
 *
 * Requests (kind 'request', target 'stego'):
 *   op 'embed'   payload { carrierPNG, ciphertext, iv, salt, tag } -> response { stegoCarrier }
 *   op 'extract' payload { carrierPNG }                            -> response { ciphertext, iv, salt, tag }
 *
 * Carriers should be fully opaque: canvas round-trips may alter RGB of pixels with alpha < 255,
 * which would corrupt LSBs.
 */
import type { WorkerErrorCode, WorkerMessage } from '../../store/types';
import { embed, PayloadTooLargeError, CarrierCapacityError } from './LSBEmbedder';
import { extract, BadMagicError, ChecksumFailError } from './LSBExtractor';
import { packPayload, unpackPayload, PackFormatError } from './payloadPacking';
import { CARRIER_SIZE, InvalidCarrierError, decodePNG } from '../shared/pngDecode';

export { CARRIER_SIZE };

export interface EmbedRequestPayload {
  carrierPNG: Uint8Array;
  ciphertext: Uint8Array;
  iv: Uint8Array;
  salt: Uint8Array;
  tag: Uint8Array;
}
export interface ExtractRequestPayload {
  carrierPNG: Uint8Array;
}
export interface EmbedResponsePayload {
  stegoCarrier: Uint8Array;
}
export interface ExtractResponsePayload {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  salt: Uint8Array;
  tag: Uint8Array;
}

export type StegoReply = WorkerMessage;

function errorReply(id: string, op: string, code: WorkerErrorCode, message: string): StegoReply {
  return { kind: 'error', id, target: 'stego', op, code, message };
}

async function encodePNG(pixels: Uint8ClampedArray): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(CARRIER_SIZE, CARRIER_SIZE);
  const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
  if (!ctx) throw new InvalidCarrierError();
  const img = new ImageData(new Uint8ClampedArray(pixels), CARRIER_SIZE, CARRIER_SIZE, { colorSpace: 'srgb' });
  ctx.putImageData(img, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Uint8Array(await blob.arrayBuffer());
}

async function handleEmbed(id: string, p: EmbedRequestPayload): Promise<StegoReply> {
  const packed = packPayload({ iv: p.iv, salt: p.salt, ciphertext: p.ciphertext, tag: p.tag });
  const pixels = await decodePNG(p.carrierPNG);
  const stego = embed(pixels, packed); // throws PayloadTooLargeError before touching pixels
  const stegoCarrier = await encodePNG(stego);
  const payload: EmbedResponsePayload = { stegoCarrier };
  return { kind: 'response', id, target: 'stego', op: 'embed', payload };
}

async function handleExtract(id: string, p: ExtractRequestPayload): Promise<StegoReply> {
  const pixels = await decodePNG(p.carrierPNG);
  const blob = extract(pixels);
  const payload: ExtractResponsePayload = unpackPayload(blob);
  return { kind: 'response', id, target: 'stego', op: 'extract', payload };
}

/** Pure message handler; testable without a Worker. Never throws. */
export async function handleStegoMessage(msg: WorkerMessage): Promise<StegoReply> {
  if (msg.kind !== 'request' || msg.target !== 'stego') {
    return errorReply(msg.id, 'op' in msg ? msg.op : '', 'INVALID_INPUT', 'Unsupported message');
  }
  try {
    switch (msg.op) {
      case 'embed':
        return await handleEmbed(msg.id, msg.payload as EmbedRequestPayload);
      case 'extract':
        return await handleExtract(msg.id, msg.payload as ExtractRequestPayload);
      default:
        return errorReply(msg.id, msg.op, 'INVALID_INPUT', 'Unknown operation');
    }
  } catch (e) {
    if (e instanceof BadMagicError) return errorReply(msg.id, msg.op, 'BAD_MAGIC', 'BAD_MAGIC');
    if (e instanceof ChecksumFailError) return errorReply(msg.id, msg.op, 'CHECKSUM_FAIL', 'CHECKSUM_FAIL');
    if (e instanceof PayloadTooLargeError) {
      return errorReply(msg.id, msg.op, 'PAYLOAD_TOO_LARGE', 'PAYLOAD_TOO_LARGE');
    }
    if (e instanceof CarrierCapacityError) {
      return errorReply(msg.id, msg.op, 'CARRIER_CAPACITY_EXCEEDED', 'CARRIER_CAPACITY_EXCEEDED');
    }
    if (e instanceof InvalidCarrierError || e instanceof PackFormatError) {
      return errorReply(msg.id, msg.op, 'INVALID_INPUT', 'Invalid input');
    }
    // Generic: never forward e.message.
    return errorReply(msg.id, msg.op, 'INTERNAL', 'Stego operation failed');
  }
}

// Worker wiring: only active inside a DedicatedWorkerGlobalScope.
const isWorkerScope =
  typeof self !== 'undefined' &&
  typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== 'undefined' &&
  self instanceof (globalThis as unknown as { WorkerGlobalScope: new () => object }).WorkerGlobalScope;

if (isWorkerScope) {
  const scope = self as unknown as {
    onmessage: ((ev: MessageEvent<WorkerMessage>) => void) | null;
    postMessage: (m: unknown, transfer?: Transferable[]) => void;
  };
  scope.onmessage = (ev) => {
    void handleStegoMessage(ev.data).then((reply) => scope.postMessage(reply));
  };
}
