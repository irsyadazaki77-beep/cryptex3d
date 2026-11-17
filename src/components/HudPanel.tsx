import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

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

export default HudPanel;
