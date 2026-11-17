import { Loader2 } from 'lucide-react';
import { useVaultStore } from '../store/vaultStore';
import type { PipelineState } from '../store/types';

const ACTIVE_STATES: ReadonlySet<PipelineState> = new Set<PipelineState>([
  'deriving',
  'encrypting',
  'embedding',
  'auditing',
  'transferring',
  'extracting',
  'decrypting',
]);

/** Returns the state name when it is an active stage, else null. */
export function activeLabel(state: PipelineState): PipelineState | null {
  return ACTIVE_STATES.has(state) ? state : null;
}

/** Progress indicator labelled with the active pipeline state (Req 9.4, 9.6). */
export function PipelineStatusIndicator() {
  const encryptState = useVaultStore((s) => s.encryptStatus.state);
  const decryptState = useVaultStore((s) => s.decryptStatus.state);
  const labels = [activeLabel(encryptState), activeLabel(decryptState)].filter(
    (l): l is PipelineState => l !== null,
  );
  if (labels.length === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto flex flex-col gap-1 rounded-xl border border-indigo-400/30 bg-[#0a0f1e]/75 px-4 py-3 text-xs uppercase tracking-widest text-slate-200 shadow-[0_8px_32px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl"
    >
      {labels.map((label, i) => (
        <div key={`${label}-${i}`} className="flex items-center gap-2 font-mono">
          <Loader2 size={16} className="animate-spin text-indigo-300" />
          <span className="animate-hud-pulse text-indigo-100">{label}</span>
        </div>
      ))}
    </div>
  );
}

export default PipelineStatusIndicator;
