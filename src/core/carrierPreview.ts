/**
 * Carrier preview: decodes a carrier PNG off the main thread (stego worker, op 'inspect') and
 * reports its raw pixels and payload extent for the X-Ray lens. Owns a separate lazy
 * stego worker, so it never contends with the encrypt/decrypt pipeline. No React, no Three.js.
 */
import { createManagedWorker, type ManagedWorker, type RequestMessage } from './WorkerManager';
import type { InspectResponsePayload } from './stego/StegoWorker';

export interface CarrierInspection {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  payloadBits: number | null;
}

let worker: ManagedWorker | null = null;
let counter = 0;

function getWorker(): ManagedWorker {
  worker ??= createManagedWorker(
    () => new Worker(new URL('./stego/StegoWorker.ts', import.meta.url), { type: 'module' }),
  );
  return worker;
}

/** @throws WorkerRequestError (code only) when the file is not a valid 1024x1024 PNG. */
export async function inspectCarrier(png: Uint8Array): Promise<CarrierInspection> {
  const msg: RequestMessage = {
    kind: 'request',
    id: `inspect-${++counter}`,
    target: 'stego',
    op: 'inspect',
    payload: { carrierPNG: png },
  };
  const r = await getWorker().request<InspectResponsePayload>(msg);
  return { pixels: r.pixels, width: r.width, height: r.height, payloadBits: r.payloadBits };
}
