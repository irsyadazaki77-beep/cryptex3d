import { describe, expect, it } from 'vitest';
import { handleAuditorMessage } from '../../src/core/auditor/AuditorWorker';

describe('handleAuditorMessage', () => {
  it('returns AUDIT_FAIL when the carrier cannot be decoded', async () => {
    const r = await handleAuditorMessage({
      kind: 'request', id: '1', target: 'auditor', op: 'audit',
      payload: { carrierPNG: new Uint8Array([1, 2, 3]) },
    });
    expect(r).toMatchObject({ kind: 'error', id: '1', target: 'auditor', code: 'AUDIT_FAIL' });
  });

  it('returns AUDIT_FAIL when the payload is missing', async () => {
    const r = await handleAuditorMessage({
      kind: 'request', id: '2', target: 'auditor', op: 'audit', payload: undefined,
    });
    expect(r).toMatchObject({ kind: 'error', code: 'AUDIT_FAIL' });
  });

  it('returns INVALID_INPUT for unknown op', async () => {
    const r = await handleAuditorMessage({ kind: 'request', id: '3', target: 'auditor', op: 'nope', payload: {} });
    expect(r).toMatchObject({ kind: 'error', code: 'INVALID_INPUT' });
  });
});
