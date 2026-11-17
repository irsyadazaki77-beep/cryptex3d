import { Suspense, lazy, useState, type ComponentType, type ReactNode } from 'react';
import { Eye, EyeOff, Lock, Radio, ScanSearch, Unlock } from 'lucide-react';
import { HudDockedContext } from './HudPanel';
import { useVaultStore } from '../store/vaultStore';

// Each panel stays its own lazy chunk. A panel mounts on first visit and then stays mounted
// (hidden, not unmounted) so P2P connections and typed form state survive tab switches.
const EncryptPanel = lazy(() => import('./EncryptPanel'));
const DecryptPanel = lazy(() => import('./DecryptPanel'));
const P2PPanel = lazy(() => import('./P2PPanel'));
const AuditPanel = lazy(() => import('./AuditPanel'));

export type DockTab = 'encrypt' | 'decrypt' | 'p2p' | 'audit';

interface TabDef {
  id: DockTab;
  label: string;
  icon: ReactNode;
  Panel: ComponentType;
}

const TABS: readonly TabDef[] = [
  { id: 'encrypt', label: 'Encrypt', icon: <Lock size={16} />, Panel: EncryptPanel },
  { id: 'decrypt', label: 'Decrypt', icon: <Unlock size={16} />, Panel: DecryptPanel },
  { id: 'p2p', label: 'P2P Drop', icon: <Radio size={16} />, Panel: P2PPanel },
  { id: 'audit', label: 'AI Audit', icon: <ScanSearch size={16} />, Panel: AuditPanel },
];

/**
 * Floating right-hand Command Dock with mode tabs, plus a top-right Zen toggle that hides
 * the dock so the 3D vault fills the viewport.
 */
export function CommandDock() {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<DockTab>('encrypt');
  const [visited, setVisited] = useState<ReadonlySet<DockTab>>(() => new Set<DockTab>(['encrypt']));
  const hasReport = useVaultStore((s) => s.auditReport !== null);
  const hasCarrier = useVaultStore((s) => s.stegoCarrier !== null || s.decryptShards.length > 0);

  const select = (id: DockTab): void => {
    setTab(id);
    setVisited((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  };
  const badge: Record<DockTab, boolean> = {
    encrypt: false,
    decrypt: hasCarrier,
    p2p: false,
    audit: hasReport,
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-pressed={!open}
        aria-controls="command-dock"
        aria-label={open ? 'Hide HUD (Zen mode)' : 'Show HUD'}
        title={open ? 'Hide HUD (Zen mode)' : 'Show HUD'}
        className="pointer-events-auto absolute right-4 top-4 flex h-11 items-center gap-2 rounded-lg border border-cyan-400/25 bg-[#0a0f1d]/75 px-3 text-xs font-medium uppercase tracking-widest text-slate-200 shadow-[0_8px_32px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl transition duration-200 hover:border-cyan-300/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
      >
        {open ? <EyeOff size={16} /> : <Eye size={16} />}
        <span>{open ? 'Zen' : 'HUD'}</span>
      </button>

      <aside
        id="command-dock"
        aria-label="Command dock"
        aria-hidden={!open}
        className={`absolute right-4 top-[4.25rem] flex max-h-[calc(100vh-5.5rem)] w-[calc(100vw-2rem)] max-w-[390px] flex-col rounded-xl border border-cyan-400/25 bg-[#0a0f1d]/75 text-sm text-slate-200 shadow-[0_8px_32px_rgba(0,0,0,0.6),0_0_0_1px_rgba(168,85,247,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl transition duration-300 ease-out ${
          open
            ? 'pointer-events-auto translate-x-0 opacity-100'
            : 'pointer-events-none invisible translate-x-6 opacity-0'
        }`}
      >
        <div role="tablist" aria-label="Vault modes" className="grid grid-cols-4 gap-1 border-b border-white/5 p-1.5">
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                id={`dock-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`dock-panel-${t.id}`}
                onClick={() => select(t.id)}
                className={`relative flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-xs font-medium transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
                  active
                    ? 'bg-indigo-500/20 text-white shadow-[inset_0_-2px_0_rgba(34,211,238,0.8)]'
                    : 'text-slate-200/55 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                {t.icon}
                <span className="whitespace-nowrap">{t.label}</span>
                {badge[t.id] && (
                  <span
                    aria-hidden="true"
                    className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]"
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="hud-scroll min-h-0 flex-1 overflow-y-auto p-4">
          <HudDockedContext.Provider value={true}>
            {TABS.map((t) =>
              visited.has(t.id) ? (
                <div
                  key={t.id}
                  id={`dock-panel-${t.id}`}
                  role="tabpanel"
                  aria-labelledby={`dock-tab-${t.id}`}
                  hidden={t.id !== tab}
                >
                  <Suspense fallback={null}>
                    <t.Panel />
                  </Suspense>
                </div>
              ) : null,
            )}
          </HudDockedContext.Provider>
        </div>
      </aside>
    </>
  );
}

export default CommandDock;
