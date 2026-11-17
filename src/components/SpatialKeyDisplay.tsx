import { Fingerprint } from 'lucide-react';
import { HudPanel } from './HudPanel';
import { useVaultStore } from '../store/vaultStore';

export interface SpatialKeyDisplayProps {
  className?: string;
}

/** Shows the full 64-char hex of the current Spatial Key hash (Req 9.5). */
export function SpatialKeyDisplay({ className }: SpatialKeyDisplayProps) {
  const hash = useVaultStore((s) => s.spatialKeySnapshot?.serializedHash ?? null);

  return (
    <HudPanel
      title="Spatial Key"
      icon={<Fingerprint size={16} />}
      defaultCollapsed
      className={className}
    >
      {hash ? (
        <pre
          aria-label="Spatial key hash"
          className="m-0 rounded-lg border border-slate-700/60 bg-slate-950/60 p-3 whitespace-pre-wrap break-all font-mono text-sm text-[#e2e8f0]"
        >
          {hash}
        </pre>
      ) : (
        <p className="m-0 rounded-lg border border-slate-700/60 bg-slate-950/60 p-3 font-mono text-sm text-[rgba(226,232,240,0.55)]">
          No spatial key captured
        </p>
      )}
    </HudPanel>
  );
}

export default SpatialKeyDisplay;
