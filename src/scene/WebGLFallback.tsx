/**
 * WebGL fallback panel (task 10.6, Requirement 1.7).
 * Rendered by SceneRoot when WebGL is unavailable. Offers a manual 64-hex
 * Spatial Key override. This is the spec'd fallback; the store write is minimal
 * and the entered key is never logged.
 */
import { useState, type FormEvent } from 'react';
import { AlertTriangle, KeyRound } from 'lucide-react';
import { useVaultStore } from '../store/vaultStore';
import type { SpatialKeySnapshot } from '../store/types';

export interface WebGLFallbackProps {
  /** Optional non-sensitive reason (error code / message) for display. */
  reason?: string;
}

export const INVALID_SPATIAL_KEY_MESSAGE =
  'Invalid spatial key: must be exactly 64 hexadecimal characters';

const HEX64 = /^[0-9a-fA-F]{64}$/;

/** Returns null when valid, otherwise the user-visible error message. */
export function validateSpatialKeyHex(input: string): string | null {
  return HEX64.test(input) ? null : INVALID_SPATIAL_KEY_MESSAGE;
}

function snapshotFromHex(hex: string): SpatialKeySnapshot {
  return {
    monolithRotationX: 0,
    monolithRotationY: 0,
    monolithRotationZ: 0,
    ringSegmentPositions: [0, 0, 0, 0, 0, 0, 0, 0],
    crystalActivated: false,
    serializedHash: hex.toLowerCase(),
  };
}

export default function WebGLFallback({ reason }: WebGLFallbackProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const err = validateSpatialKeyHex(value);
    setError(err);
    if (err) {
      setApplied(false);
      return;
    }
    useVaultStore.getState().setSpatialKeySnapshot(snapshotFromHex(value));
    setApplied(true);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#060810] p-4 text-[#e2e8f0]">
      <div
        role="alert"
        className="w-full max-w-md rounded-xl border border-indigo-400/20 bg-[#0a0f1e]/75 px-5 py-4 shadow-[0_8px_32px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl"
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-[#ef4444]">
          <AlertTriangle size={20} aria-hidden="true" />
          WebGL unavailable
        </h2>
        <p className="mt-3 text-sm text-[rgba(226,232,240,0.55)]">
          The 3D scene cannot be rendered. Enter your 64-character hexadecimal Spatial Key manually to continue.
        </p>
        {reason ? (
          <p className="mt-2 font-mono text-sm text-[rgba(226,232,240,0.55)]">{reason}</p>
        ) : null}
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3" noValidate>
          <label
            htmlFor="spatial-key-override"
            className="flex items-center gap-2 text-xs uppercase tracking-widest text-[rgba(226,232,240,0.55)]"
          >
            <KeyRound size={16} aria-hidden="true" />
            Spatial Key (hex)
          </label>
          <input
            id="spatial-key-override"
            type="text"
            value={value}
            onChange={(ev) => setValue(ev.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'spatial-key-error' : undefined}
            className="h-11 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 font-mono text-sm text-[#e2e8f0] transition-colors duration-200 focus:border-indigo-400 focus:outline-none"
          />
          {error ? (
            <p id="spatial-key-error" className="text-sm text-[#ef4444]">
              {error}
            </p>
          ) : null}
          {applied ? (
            <p className="text-sm text-[#10b981]">Spatial key applied.</p>
          ) : null}
          <button
            type="submit"
            className="h-11 rounded-lg bg-indigo-500 px-4 text-sm font-medium text-white transition duration-200 hover:bg-indigo-400 hover:shadow-[0_0_24px_rgba(99,102,241,0.6)]"
          >
            Apply Spatial Key
          </button>
        </form>
        {reason ? (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 h-11 w-full rounded-lg border border-indigo-500/40 px-4 text-sm font-medium text-indigo-300 transition duration-200 hover:border-indigo-400/70 hover:bg-indigo-500/10"
          >
            Reload scene
          </button>
        ) : null}
      </div>
    </div>
  );
}
