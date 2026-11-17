import type { PipelineState } from '../store/types';
import type { DemoPhase } from './demoOrchestration';

/** Steps shown by the Judge Demo Mode stepper, in display order. */
export const DEMO_STEPS = ['Encrypt', 'Audit', 'P2P Sync', '3D Unlock', 'Decrypt'] as const;
export type DemoStepLabel = (typeof DEMO_STEPS)[number];

/** Index returned once the whole run has finished (every step shown as done). */
export const DEMO_ALL_DONE = DEMO_STEPS.length;

/**
 * Maps the orchestrator phase plus store pipeline states to the active stepper index.
 * -1 = not started, DEMO_ALL_DONE = finished. "3D Unlock" is the extraction step, where the
 * Spatial Key salt must match before the ciphertext can be authenticated.
 */
export function demoStepIndex(
  phase: DemoPhase | null,
  encryptState: PipelineState,
  decryptState: PipelineState,
): number {
  switch (phase) {
    case null:
      return -1;
    case 'key':
      return 0;
    case 'encrypt':
      return encryptState === 'auditing' || encryptState === 'complete' ? 1 : 0;
    case 'transfer':
      return 2;
    case 'decrypt':
      return decryptState === 'extracting' || decryptState === 'idle' ? 3 : 4;
    case 'done':
      return DEMO_ALL_DONE;
  }
}
