import { createContext, useContext, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

/**
 * When true, panels render only their body (no glass chrome, no collapse header) because the
 * Command Dock already provides the container and the tab label.
 */
export const HudDockedContext = createContext(false);

export interface HudPanelProps {
  title: string;
  icon: ReactNode;
  defaultCollapsed?: boolean;
  className?: string;
  children: ReactNode;
}

/** Collapsible glassmorphic HUD panel. Collapsed state shows icon + label only. */
export function HudPanel({
  title,
  icon,
  defaultCollapsed = true,
  className = '',
  children,
}: HudPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const docked = useContext(HudDockedContext);
  if (docked) return <div className={className}>{children}</div>;
  return (
    <section
      className={`group/panel pointer-events-auto rounded-xl border border-indigo-400/20 bg-[#0a0f1e]/75 px-4 py-2 text-sm text-slate-200 shadow-[0_8px_32px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl transition-colors duration-200 hover:border-indigo-400/40 focus-within:border-indigo-400/40 ${className}`}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className="flex min-h-11 w-full items-center gap-3 rounded-lg text-xs font-medium uppercase tracking-widest text-slate-200 transition-colors duration-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60"
      >
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-indigo-400/25 bg-indigo-500/15 text-indigo-300">
          {icon}
        </span>
        <span className="flex-1 text-left">{title}</span>
        {collapsed ? (
          <ChevronDown size={16} className="text-slate-200/55" />
        ) : (
          <ChevronUp size={16} className="text-slate-200/55" />
        )}
      </button>
      {!collapsed && (
        <div className="hud-scroll mt-2 max-h-[calc(100vh-12rem)] overflow-y-auto border-t border-white/5 pt-3 pr-1">
          {children}
        </div>
      )}
    </section>
  );
}

export interface HudSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/**
 * Labelled on/off switch in the HUD style (role="switch"). The track and knob are squared
 * (rounded-md / rounded-sm) to match the technical look of the rest of the HUD.
 */
export function HudSwitch({
  checked,
  onChange,
  label,
  description,
  icon,
  disabled = false,
  className = '',
}: HudSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 disabled:cursor-not-allowed disabled:opacity-40 ${
        checked
          ? 'border-cyan-400/50 bg-cyan-400/10 text-slate-100'
          : 'border-slate-700/60 bg-slate-950/60 text-slate-200 hover:border-slate-600'
      } ${className}`}
    >
      {icon && <span className={checked ? 'text-cyan-300' : 'text-slate-200/55'}>{icon}</span>}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs font-medium uppercase tracking-widest">{label}</span>
        {description && <span className="text-xs text-slate-200/55">{description}</span>}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-5 w-9 shrink-0 rounded-md border transition-colors duration-200 ${
          checked ? 'border-cyan-300/70 bg-cyan-400/30' : 'border-slate-600 bg-slate-900'
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-sm transition-transform duration-200 ${
            checked ? 'translate-x-4 bg-cyan-200' : 'translate-x-0 bg-slate-500'
          }`}
        />
      </span>
    </button>
  );
}

export default HudPanel;
