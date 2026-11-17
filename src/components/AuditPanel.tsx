import { ShieldAlert } from 'lucide-react';
import { useVaultStore } from '../store/vaultStore';
import { HudPanel } from './HudPanel';
import {
  SEVERITY_TEXT_CLASS,
  clamp01,
  scoreToSeverity,
  type AuditSeverity,
} from './auditSeverity';
import {
  TONE_FILL_CLASS,
  chiSquareTone,
  densityAdvice,
  entropyTone,
  pairTone,
  undetectability,
  type Tone,
} from './auditMetrics';
import { badgeError } from './hudStyles';

const MAX_WARNINGS = 10;
const BAR_WIDTH = 200;
const GAUGE_ARC_LENGTH = Math.PI * 50;

const GAUGE_STROKE_CLASS: Record<AuditSeverity, string> = {
  low: 'stroke-emerald-400',
  medium: 'stroke-amber-400',
  high: 'stroke-rose-400',
};

const ADVICE_CLASS: Record<Tone, string> = {
  good: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  warn: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  bad: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
};

function MetricBar({
  label,
  value,
  display,
  tone,
}: {
  label: string;
  value: number;
  display: string;
  tone: Tone;
}) {
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
        <rect x="0" y="0" width={w} height="8" rx="2" className={TONE_FILL_CLASS[tone]} />
      </svg>
    </div>
  );
}

/** Semicircular 0-100 undetectability meter. Arc geometry uses SVG attributes only (CSP-safe). */
function UndetectabilityGauge({ value, severity }: { value: number; severity: AuditSeverity }) {
  const filled = (Math.min(100, Math.max(0, value)) / 100) * GAUGE_ARC_LENGTH;
  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 120 70"
        className="w-48"
        role="img"
        aria-label={`Undetectability ${value} out of 100`}
      >
        <path
          d="M 10 60 A 50 50 0 0 1 110 60"
          fill="none"
          strokeWidth="9"
          strokeLinecap="butt"
          className="stroke-slate-800"
        />
        <path
          d="M 10 60 A 50 50 0 0 1 110 60"
          fill="none"
          strokeWidth="9"
          strokeLinecap="butt"
          strokeDasharray={`${filled} ${GAUGE_ARC_LENGTH}`}
          className={`${GAUGE_STROKE_CLASS[severity]} transition-all duration-500`}
        />
        <text
          x="60"
          y="54"
          textAnchor="middle"
          className={`fill-current font-mono text-[22px] ${SEVERITY_TEXT_CLASS[severity]}`}
        >
          {value}
        </text>
        <text x="60" y="67" textAnchor="middle" className="fill-slate-400 text-[7px] uppercase">
          undetectable / 100
        </text>
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
  const hidden = report ? undetectability(report.score) : 0;
  const pair = report?.lsbPairAnomaly;
  const advice = pair === undefined ? null : densityAdvice(pair);

  return (
    <HudPanel title="AI Audit" icon={<ShieldAlert size={16} />} className={className}>
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
        <p className="text-sm text-slate-200/55">
          No audit has been run yet. Encrypt a file and the steganalysis report appears here.
        </p>
      ) : (
        <div className="space-y-3">
          <UndetectabilityGauge value={hidden} severity={severity} />
          <p className="m-0 text-center text-xs uppercase tracking-widest text-slate-200/55">
            Detectability{' '}
            <span className={`font-mono ${SEVERITY_TEXT_CLASS[severity]}`}>
              {Math.round(clamp01(report.score / 100) * 100)}/100
            </span>
          </p>
          <MetricBar
            label="Chi-square p-value"
            value={report.chiSquarePValue}
            display={report.chiSquarePValue.toFixed(4)}
            tone={chiSquareTone(report.chiSquarePValue)}
          />
          <MetricBar
            label="Shannon entropy"
            value={report.shannonEntropy / 8}
            display={`${report.shannonEntropy.toFixed(3)} / 8`}
            tone={entropyTone(report.shannonEntropy)}
          />
          {pair !== undefined && (
            <MetricBar
              label="LSB-pair anomaly"
              value={pair}
              display={`${Math.round(clamp01(pair) * 100)}%`}
              tone={pairTone(pair)}
            />
          )}
          {advice && (
            <p
              className={`m-0 rounded-md border px-3 py-2 text-sm ${ADVICE_CLASS[advice.tone]}`}
              data-testid="density-advice"
            >
              {advice.message}
            </p>
          )}
          {report.warnings.length > 0 && (
            <ul className="m-0 list-none space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
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
