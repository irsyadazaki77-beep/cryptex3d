import { ShieldAlert } from 'lucide-react';
import { useVaultStore } from '../store/vaultStore';
import { HudPanel } from './HudPanel';
import { badgeError } from './hudStyles';
import {
  SEVERITY_FILL_CLASS,
  SEVERITY_TEXT_CLASS,
  clamp01,
  scoreToSeverity,
} from './auditSeverity';

const MAX_WARNINGS = 10;
const BAR_WIDTH = 200;

function MetricBar({ label, value, display }: { label: string; value: number; display: string }) {
  const w = Math.round(clamp01(value) * BAR_WIDTH);
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs uppercase tracking-widest text-slate-200/55">
        <span>{label}</span>
        <span className="font-mono normal-case tracking-normal text-slate-200">{display}</span>
      </div>
      <svg
        width="100%"
        height="8"
        viewBox={`0 0 ${BAR_WIDTH} 8`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label} ${display}`}
      >
        <rect x="0" y="0" width={BAR_WIDTH} height="8" rx="2" className="fill-slate-950/60" />
        <rect x="0" y="0" width={w} height="8" rx="2" className="fill-indigo-500" />
      </svg>
    </div>
  );
}

export function AuditPanel({ className }: { className?: string }) {
  const report = useVaultStore((s) => s.auditReport);
  const failed = useVaultStore((s) => s.auditFailed);
  const advanced = useVaultStore((s) => s.advancedAudit);
  const setAdvanced = useVaultStore((s) => s.setAdvancedAudit);

  const severity = report ? scoreToSeverity(report.score) : 'low';
  const score = report ? Math.round(clamp01(report.score / 100) * 100) : 0;

  return (
    <HudPanel title="Audit" icon={<ShieldAlert size={16} />} className={className}>
      <label className="mb-3 flex min-h-11 cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={advanced}
          onChange={(e) => setAdvanced(e.target.checked)}
          className="h-4 w-4 accent-indigo-500"
        />
        <span>Advanced Audit</span>
      </label>

      {failed ? (
        <p role="alert" className={badgeError}>
          Audit could not be completed
        </p>
      ) : !report ? (
        <p className="text-sm text-slate-200/55">No audit has been run yet</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-widest text-slate-200/55">
              Detectability
            </span>
            <span className={`font-mono text-lg ${SEVERITY_TEXT_CLASS[severity]}`}>
              {score}
              <span className="text-sm text-slate-200/55">/100</span>
            </span>
          </div>
          <svg
            width="100%"
            height="8"
            viewBox="0 0 100 8"
            preserveAspectRatio="none"
            role="img"
            aria-label={`Score ${score} of 100`}
          >
            <rect x="0" y="0" width="100" height="8" rx="2" className="fill-slate-950/60" />
            <rect
              x="0"
              y="0"
              width={score}
              height="8"
              rx="2"
              className={SEVERITY_FILL_CLASS[severity]}
            />
          </svg>

          <MetricBar
            label="Shannon entropy"
            value={report.shannonEntropy / 8}
            display={`${report.shannonEntropy.toFixed(3)} / 8`}
          />
          <MetricBar
            label="Chi-square p-value"
            value={report.chiSquarePValue}
            display={report.chiSquarePValue.toFixed(4)}
          />

          {report.warnings.length > 0 && (
            <ul className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
              {report.warnings.slice(0, MAX_WARNINGS).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <p className="text-sm text-slate-200/55">{report.recommendation}</p>
        </div>
      )}
    </HudPanel>
  );
}

export default AuditPanel;
