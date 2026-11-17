import { describe, expect, it } from 'vitest';
import { DEMO_ALL_DONE, DEMO_STEPS, demoStepIndex } from '../../src/components/demoSteps';

describe('demoStepIndex', () => {
  it('lists the five judge-facing steps in order', () => {
    expect([...DEMO_STEPS]).toEqual(['Encrypt', 'Audit', 'P2P Sync', '3D Unlock', 'Decrypt']);
  });

  it('is -1 before the run starts', () => {
    expect(demoStepIndex(null, 'idle', 'idle')).toBe(-1);
  });

  it('walks forward through the pipeline', () => {
    expect(demoStepIndex('key', 'idle', 'idle')).toBe(0);
    expect(demoStepIndex('encrypt', 'encrypting', 'idle')).toBe(0);
    expect(demoStepIndex('encrypt', 'embedding', 'idle')).toBe(0);
    expect(demoStepIndex('encrypt', 'auditing', 'idle')).toBe(1);
    expect(demoStepIndex('encrypt', 'complete', 'idle')).toBe(1);
    expect(demoStepIndex('transfer', 'transferring', 'idle')).toBe(2);
    expect(demoStepIndex('decrypt', 'complete', 'extracting')).toBe(3);
    expect(demoStepIndex('decrypt', 'complete', 'decrypting')).toBe(4);
    expect(demoStepIndex('done', 'complete', 'complete')).toBe(DEMO_ALL_DONE);
  });
});
