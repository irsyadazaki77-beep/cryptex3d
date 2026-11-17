/** Shared HUD control styles so every panel renders inputs, buttons and badges identically. */
const BTN_BASE =
  'inline-flex h-9 min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 disabled:cursor-not-allowed disabled:opacity-40';

export const btnPrimary = `${BTN_BASE} bg-indigo-500 text-white hover:bg-indigo-400 hover:shadow-[0_0_24px_rgba(99,102,241,0.6)] active:bg-indigo-600 disabled:hover:bg-indigo-500 disabled:hover:shadow-none`;

export const btnSecondary = `${BTN_BASE} border border-indigo-500/40 text-indigo-300 hover:border-indigo-400/70 hover:bg-indigo-500/10 hover:shadow-[0_0_24px_rgba(99,102,241,0.35)] active:bg-indigo-500/20 disabled:hover:border-indigo-500/40 disabled:hover:bg-transparent disabled:hover:shadow-none`;

export const inputCls =
  'w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 font-mono text-sm normal-case tracking-normal text-slate-200 transition-colors duration-200 placeholder:text-slate-200/40 hover:border-slate-600 focus:border-indigo-400 focus:outline-none disabled:opacity-40';

export const textareaCls = `${inputCls} resize-y p-2`;

export const labelCls = 'flex flex-col gap-1 text-xs uppercase tracking-widest text-slate-200/55';

/** Translucent semantic status badges. */
export const badgeSuccess =
  'inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-sm text-emerald-400';
export const badgeWarning =
  'inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-sm text-amber-400';
export const badgeError =
  'inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-sm text-rose-400';
