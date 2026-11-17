import { AlertTriangle } from 'lucide-react';
import { useVaultStore } from '../store/vaultStore';
import { sanitizeError } from './errorSanitizer';

/** Displays a sanitized form of vaultStore.lastError (Req 12.1, 12.2). */
export function ErrorBanner() {
  const lastError = useVaultStore((s) => s.lastError);
  if (lastError === null) return null;
  return (
    <div
      role="alert"
      className="pointer-events-auto flex items-start gap-2 rounded-xl border border-rose-500/40 bg-[#0a0f1e]/75 px-4 py-3 text-sm text-rose-400 shadow-[0_0_20px_rgba(239,68,68,0.7)] backdrop-blur-xl"
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <span className="font-mono">{sanitizeError(lastError)}</span>
    </div>
  );
}

export default ErrorBanner;
