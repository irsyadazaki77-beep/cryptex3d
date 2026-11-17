import { Suspense, lazy, useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';

// Scene (three.js) is its own chunk to keep the initial bundle small.
const SceneRoot = lazy(() => import('./scene/SceneRoot'));
import { PipelineStatusIndicator } from './components/PipelineStatusIndicator';
import { ErrorBanner } from './components/ErrorBanner';

/**
 * Lazily load audio. The engine creates its AudioContext on the first user
 * interaction (autoplay policy); the ambient synthesizer starts once it is ready.
 */
function useLazyAudio(): void {
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;
    void Promise.all([import('./core/audio/AudioEngine'), import('./core/audio/AmbientSynthesizer')])
      .then(([engineMod, ambientMod]) => {
        if (disposed) return;
        const engine = engineMod.getAudioEngine();
        engine.start();
        const ambient = new ambientMod.AmbientSynthesizer(engine);
        ambient.start();
        cleanup = () => ambient.dispose();
      })
      .catch(() => undefined); // audio failures are suppressed silently
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);
}

const EncryptPanel = lazy(() => import('./components/EncryptPanel'));
const DecryptPanel = lazy(() => import('./components/DecryptPanel'));
const AuditPanel = lazy(() => import('./components/AuditPanel'));
const P2PPanel = lazy(() => import('./components/P2PPanel'));
const DemoModeOrchestrator = lazy(() => import('./components/DemoModeOrchestrator'));
const SpatialKeyDisplay = lazy(() => import('./components/SpatialKeyDisplay'));

export default function App() {
  useLazyAudio();
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#060810]">
      <Suspense fallback={null}>
        <SceneRoot />
      </Suspense>

      {/* HUD overlay: floats above the canvas; only its panels capture pointer events. */}
      <div className="pointer-events-none absolute inset-0 z-10">
        {/* Left column: collapsed panels are compact icon + label strips. */}
        <div className="hud-scroll absolute left-0 top-0 flex max-h-[calc(100vh-8rem)] w-72 flex-col gap-3 overflow-y-auto p-4 lg:w-80">
          <Suspense fallback={null}>
            <EncryptPanel />
            <DecryptPanel />
          </Suspense>
        </div>
        {/* Right column */}
        <div className="hud-scroll absolute right-0 top-0 flex max-h-[calc(100vh-8rem)] w-72 flex-col gap-3 overflow-y-auto p-4 lg:w-80">
          <Suspense fallback={null}>
            <AuditPanel />
            <P2PPanel />
          </Suspense>
        </div>
        {/* Top centre: brand badge, pipeline status and errors */}
        <div className="absolute left-1/2 top-0 flex w-72 -translate-x-1/2 flex-col items-center gap-3 p-4">
          <div className="pointer-events-none flex items-center gap-2 rounded-lg border border-indigo-400/20 bg-[#0a0f1e]/60 px-3 py-1.5 text-xs font-medium uppercase tracking-widest text-slate-200/80 shadow-[0_8px_32px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
            <ShieldCheck size={16} className="text-indigo-300" />
            <span className="whitespace-nowrap">Cryptex3D // Spatial Crypto Vault</span>
          </div>
          <div className="flex w-full flex-col gap-3">
            <PipelineStatusIndicator />
            <ErrorBanner />
          </div>
        </div>
        {/* Bottom left: spatial key */}
        <div className="absolute bottom-0 left-0 w-72 p-4 lg:w-80">
          <Suspense fallback={null}>
            <SpatialKeyDisplay />
          </Suspense>
        </div>
        <div
          id="demo-mode-slot"
          data-slot="demo-mode-orchestrator"
          className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2"
        >
          <Suspense fallback={null}>
            <DemoModeOrchestrator />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
