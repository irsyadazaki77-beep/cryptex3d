import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, Play, X } from 'lucide-react';
import { useVaultStore } from '../store/vaultStore';
import { createDefaultDemoDeps } from './demoDeps';
import { runDemo, type DemoPhase, type DemoResult } from './demoOrchestration';
import { btnPrimary } from './hudStyles';

/**
 * Judge Demo Mode. Runs the full encrypt -> embed -> audit -> transfer ->
 * extract -> decrypt pipeline on a fixed payload, key and DEMO-ONLY passphrase
 * (see DEMO_PASSPHRASE in demoOrchestration.ts) within a 60 s deadline.
 */
export function DemoModeOrchestrator() {
  const [phase, setPhase] = useState<DemoPhase | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);
  const mounted = useRef(true);
  const encryptState = useVaultStore((s) => s.encryptStatus.state);
  const decryptState = useVaultStore((s) => s.decryptStatus.state);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const start = useCallback(async () => {
    setResult(null);
    setRunning(true);
    setPhase('key');
    const deps = createDefaultDemoDeps((p) => {
      if (mounted.current) setPhase(p);
    });
    const outcome = await runDemo(deps);
    if (!mounted.current) return;
    setResult(outcome);
    setRunning(false);
  }, []);

  let stage: string | null = null;
  if (running) {
    if (phase === 'key') stage = 'deriving';
    else if (phase === 'transfer') stage = 'transferring';
    else if (phase === 'encrypt') stage = encryptState;
    else if (phase === 'decrypt') stage = decryptState;
  }

  return (
    <div className="pointer-events-auto flex w-72 flex-col items-center gap-3 lg:w-80">
      <button
        type="button"
        onClick={() => void start()}
        disabled={running}
        className={`${btnPrimary} px-6 uppercase tracking-widest`}
      >
        {running ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} />}
        Judge Demo Mode
      </button>

      {stage !== null && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-indigo-400/30 bg-[#0a0f1e]/75 px-4 py-2 font-mono text-xs uppercase tracking-widest text-slate-200 backdrop-blur-xl"
        >
          Stage: {stage}
        </div>
      )}

      {result?.status === 'timeout' && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-[#0a0f1e]/75 px-4 py-2 text-sm text-rose-400 backdrop-blur-xl"
        >
          <X size={16} />
          Demo timed out
        </div>
      )}

      {result?.status === 'error' && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-[#0a0f1e]/75 px-4 py-2 font-mono text-sm text-rose-400 backdrop-blur-xl"
        >
          <X size={16} />
          {result.message}
        </div>
      )}

      {result?.status === 'complete' && (
        <div className="w-full rounded-xl border border-indigo-400/20 bg-[#0a0f1e]/75 px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
          <div
            className={`mb-2 flex items-center gap-2 text-sm ${
              result.matches ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {result.matches ? <Check size={16} /> : <X size={16} />}
            {result.matches ? 'Payload matches original' : 'Payload mismatch'}
          </div>
          <pre
            aria-label="Decrypted payload (hex)"
            className="hud-scroll max-h-32 overflow-y-auto break-all whitespace-pre-wrap font-mono text-xs text-slate-200/55"
          >
            {result.hex}
          </pre>
        </div>
      )}
    </div>
  );
}

export default DemoModeOrchestrator;
