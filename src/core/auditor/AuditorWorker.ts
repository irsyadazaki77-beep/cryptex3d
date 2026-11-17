/**
 * AuditorWorker: dedicated module Worker running the advisory LSB steganalysis.
 * Must not import React or Three.js. Errors carry codes only.
 *
 * Spawn with: new Worker(new URL('./AuditorWorker.ts', import.meta.url), { type: 'module' })
 *
 * Request (kind 'request', target 'auditor'):
 *   op 'audit' payload { carrierPNG: Uint8Array, advancedAudit?: boolean } -> response AuditReport
 * Any failure yields an error reply with code 'AUDIT_FAIL'. Results are advisory only.
 */
import type { AuditReport, WorkerErrorCode, WorkerMessage } from '../../store/types';
import { decodePNG } from '../shared/pngDecode';
import { scoreCarrier } from './HeuristicScorer';
import { buildAuditReport } from './AuditReportBuilder';

export interface AuditRequestPayload {
  carrierPNG: Uint8Array;
  advancedAudit?: boolean;
}

export type AuditorReply = WorkerMessage;

function errorReply(id: string, op: string, code: WorkerErrorCode): AuditorReply {
  return { kind: 'error', id, target: 'auditor', op, code, message: code };
}

/** Pure message handler; testable without a Worker. Never throws. */
export async function handleAuditorMessage(msg: WorkerMessage): Promise<AuditorReply> {
  if (msg.kind !== 'request' || msg.target !== 'auditor') {
    return errorReply(msg.id, 'op' in msg ? msg.op : '', 'INVALID_INPUT');
  }
  if (msg.op !== 'audit') return errorReply(msg.id, msg.op, 'INVALID_INPUT');
  try {
    const p = msg.payload as AuditRequestPayload;
    const pixels = await decodePNG(p.carrierPNG);
    const result = await scoreCarrier(pixels, { advancedAudit: p.advancedAudit === true });
    const report: AuditReport = buildAuditReport(result);
    return { kind: 'response', id: msg.id, target: 'auditor', op: 'audit', payload: report };
  } catch {
    // Never forward e.message.
    return errorReply(msg.id, msg.op, 'AUDIT_FAIL');
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
    void handleAuditorMessage(ev.data).then((reply) => scope.postMessage(reply));
  };
}
