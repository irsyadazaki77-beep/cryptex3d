import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, Loader2, Play, X } from 'lucide-react';
import { useVaultStore } from '../store/vaultStore';
import { createDefaultDemoDeps } from './demoDeps';
import { runDemo, type DemoPhase, type DemoResult } from './demoOrchestration';
import { DEMO_ALL_DONE, DEMO_STEPS, demoStepIndex } from './demoSteps';
import { btnPrimary } from './hudStyles';

/** Minimum time each stepper stage stays visible so fast stages are still readable. */
const MIN_STEP_MS = 450;

/** Trails `target` by at most one step per MIN_STEP_MS so quick stages stay legible. */
function useTrailingIndex(target: number): number {
  const [shown, setShown] = useState(target);
  useEffect(() => {
    if (target < shown) {
      setShown(target); // reset (new run) is immediate
      return;
    }
    if (target === shown) return;
    const id = setTimeout(() => setShown((s) => s + 1), MIN_STEP_MS);
    return () => clearTimeout(id);
  }, [target, shown]);
  return shown;
}

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

  const liveIndex = demoStepIndex(phase, encryptState, decryptState);
  // After a failed/timed-out run keep the stepper where it stopped; only a successful run completes it.
  const targetIndex = result?.status === 'complete' ? DEMO_ALL_DONE : liveIndex;
  const stepIndex = useTrailingIndex(targetIndex);
  const showStepper = running || result !== null;
  const failed = result?.status === 'error' || result?.status === 'timeout';

  let stage: string | null = null;
  if (running) {
    if (phase === 'key') stage = 'deriving';
    else if (phase === 'transfer') stage = 'transferring';
    else if (phase === 'encrypt') stage = encryptState;
    else if (phase === 'decrypt') stage = decryptState;
  }

  return (
    <div className="pointer-events-auto flex w-[min(92vw,34rem)] flex-col items-center gap-3">
      {result?.status === 'timeout' && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-[#0a0f1d]/75 px-4 py-2 text-sm text-rose-400 backdrop-blur-xl"
        >
          <X size={16} />
          Demo timed out
        </div>
      )}
      {result?.status === 'error' && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-[#0a0f1d]/75 px-4 py-2 font-mono text-sm text-rose-400 backdrop-blur-xl"
        >
          <X size={16} />
          {result.message}
        </div>
      )}
      {result?.status === 'complete' && (
        <div className="w-full rounded-xl border border-cyan-400/20 bg-[#0a0f1d]/75 px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
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
            className="hud-scroll max-h-24 overflow-y-auto break-all whitespace-pre-wrap font-mono text-xs text-slate-200/55"
          >
            {result.hex}
          </pre>
        </div>
      )}
      {showStepper && (
        <ol
          aria-label="Judge demo progress"
          className="m-0 flex list-none flex-wrap items-center justify-center gap-1 rounded-xl border border-cyan-400/20 bg-[#0a0f1d]/75 p-2 shadow-[0_8px_32px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl"
        >
          {DEMO_STEPS.map((label, i) => {
            const done = i < stepIndex;
            const active = i === stepIndex && !failed;
            const stopped = i === stepIndex && failed;
            return (
              <li key={label} className="flex items-center gap-1" aria-current={active ? 'step' : undefined}>
                <span
                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors duration-200 ${
                    done
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      : active
                        ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200'
                        : stopped
                          ? 'border-rose-500/40 bg-rose-500/10 text-rose-400'
                          : 'border-slate-700/60 bg-slate-950/60 text-slate-200/45'
                  }`}
                >
                  {done ? (
                    <Check size={12} />
                  ) : active ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : stopped ? (
                    <X size={12} />
                  ) : (
                    <span className="font-mono">{i + 1}</span>
                  )}
                  <span className={active ? 'animate-hud-pulse' : undefined}>{label}</span>
                </span>
                {i < DEMO_STEPS.length - 1 && (
                  <ChevronRight size={12} className="text-slate-200/30" aria-hidden="true" />
                )}
              </li>
            );
          })}
        </ol>
      )}
      {stage !== null && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-indigo-400/30 bg-[#0a0f1d]/75 px-4 py-1.5 font-mono text-xs uppercase tracking-widest text-slate-200 backdrop-blur-xl"
        >
          Stage: {stage}
        </div>
      )}
      <button
        type="button"
        onClick={() => void start()}
        disabled={running}
        className={`${btnPrimary} px-6 uppercase tracking-widest`}
      >
        {running ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} />}
        Judge Demo Mode
      </button>
    </div>
  );
}

export default DemoModeOrchestrator;
