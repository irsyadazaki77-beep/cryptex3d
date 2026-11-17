import { useState } from 'react';
import { ChevronDown, ChevronUp, Fingerprint } from 'lucide-react';
import { useVaultStore } from '../store/vaultStore';

export interface SpatialKeyDisplayProps {
  className?: string;
}

const RING_STEP_DEGREES = 36;

/** Compact translucent readout: ring angles plus the full 64-char SHA-256 spatial hash (Req 9.5). */
export function SpatialKeyDisplay({ className = '' }: SpatialKeyDisplayProps) {
  const snapshot = useVaultStore((s) => s.spatialKeySnapshot);
  const [collapsed, setCollapsed] = useState(false);
  const hash = snapshot?.serializedHash ?? null;

  return (
    <section
      aria-label="Spatial key"
      className={`pointer-events-auto rounded-xl border border-cyan-400/20 bg-[#0a0f1d]/60 px-3 py-2 text-slate-200 shadow-[0_8px_32px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl transition-colors duration-200 hover:border-cyan-400/40 ${className}`}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className="flex min-h-11 w-full items-center gap-2 rounded-lg text-xs font-medium uppercase tracking-widest text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60"
      >
        <Fingerprint size={16} className="text-cyan-300" />
        <span className="flex-1 text-left">Spatial Key</span>
        {collapsed && hash && (
          <span className="font-mono text-xs normal-case tracking-normal text-slate-200/55">
            {hash.slice(0, 8)}…
          </span>
        )}
        {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {!collapsed && (
        <div className="border-t border-white/5 pt-2">
          {snapshot ? (
            <div className="flex flex-col gap-2">
              <div>
                <p className="mb-1 text-xs uppercase tracking-widest text-slate-200/55">
                  Ring angles
                </p>
                <ul className="m-0 grid list-none grid-cols-4 gap-1 p-0" aria-label="Ring segment angles">
                  {snapshot.ringSegmentPositions.map((pos, i) => (
                    <li
                      key={i}
                      className="rounded-md border border-slate-700/60 bg-slate-950/60 px-1.5 py-0.5 text-center font-mono text-xs text-emerald-300"
                    >
                      {pos * RING_STEP_DEGREES}°
                    </li>
                  ))}
                </ul>
              </div>
              <pre
                aria-label="Spatial key hash"
                className="m-0 whitespace-pre-wrap break-all rounded-lg border border-slate-700/60 bg-slate-950/60 p-2 font-mono text-xs text-[#e2e8f0]"
              >
                {hash}
              </pre>
            </div>
          ) : (
            <p className="m-0 rounded-lg border border-slate-700/60 bg-slate-950/60 p-2 font-mono text-xs text-[rgba(226,232,240,0.55)]">
              No spatial key captured
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export default SpatialKeyDisplay;
