# Architecture Steering — Cryptex3D

This document is active steering for the Kiro agent. Enforce these constraints on every code-generation and refactoring decision.

## Layer Boundaries

Cryptex3D is divided into four strictly separated layers. No layer may import from a layer outside its defined dependency direction.

```
┌─────────────────────────────────────────┐
│  React 19 UI  (src/components/, src/ui/)│  ← User-facing state & HUD only
└───────────────────┬─────────────────────┘
                    │ props / callbacks / Zustand selectors
┌───────────────────▼─────────────────────┐
│  Three.js Scene  (src/scene/)           │  ← 60 fps WebGL render loop only
└───────────────────┬─────────────────────┘
                    │ postMessage / SharedArrayBuffer
┌───────────────────▼─────────────────────┐
│  Web Worker Pipelines  (src/core/)      │  ← CPU-heavy, off-main-thread
│    crypto/   stego/   auditor/          │
└───────────────────┬─────────────────────┘
                    │ RTCDataChannel / BroadcastChannel
┌───────────────────▼─────────────────────┐
│  P2P Transport  (src/core/p2p/)         │  ← Network I/O only
└─────────────────────────────────────────┘
```

## Mandatory Separation Rules

### React 19 UI Layer
- Owns all React state (`useState`, `useReducer`, Zustand store).
- Must NOT import Three.js types or objects directly — communicate through refs and callbacks only.
- Must NOT perform crypto operations inline; delegate to Web Worker pipeline via the `useWorker` hook.
- Zero `document.querySelector` or imperative DOM manipulation outside React root.

### Three.js 60 fps Render Loop (`src/scene/`)
- Runs entirely inside `requestAnimationFrame`; must NOT block the main thread for >4 ms per frame.
- Must NOT call React state setters directly inside the render loop — use an event emitter or `postMessage` to decouple.
- Must dispose every `BufferGeometry`, `Material`, `Texture`, and `WebGLRenderTarget` in the component's cleanup / `useEffect` teardown.
- Must apply `THREE.NoColorSpace` to all carrier `DataTexture` objects to prevent gamma-correction mutation of pixel values.
- Must provide a graceful fallback (`<canvas>` with error message) when `WebGLRenderer` creation fails.

### Web Worker Pipelines (`src/core/crypto/`, `src/core/stego/`, `src/core/auditor/`)
- Each pipeline runs in its own dedicated `Worker` thread; workers must NOT share state with each other directly.
- Workers communicate with the main thread exclusively via `postMessage` / `onmessage` with typed message envelopes.
- Crypto and stego workers must be initialized lazily (spin up on first use, terminate on idle timeout).
- Must NOT import React or Three.js.

### WebRTC + BroadcastChannel Transport (`src/core/p2p/`)
- Handles all network I/O and multi-tab messaging.
- Must NOT perform crypto or stego operations — receives and emits raw byte arrays only.
- BroadcastChannel fallback must activate automatically when RTCPeerConnection is unavailable or not yet connected.
- SDP offer/answer must be copy-paste or QR-transferable with zero signaling server.

## Cross-Cutting Concerns

- **No secrets in the render layer**: passphrase and derived key material must never reach `src/scene/` or `src/components/`.
- **TypeScript strict mode** (`"strict": true`) must be enabled project-wide; `any` casts require an inline `// eslint-disable` comment with justification.
- **Vite code-splitting**: each major module (`scene`, `crypto`, `stego`, `auditor`, `p2p`, `audio`) must be a dynamic import chunk to keep initial bundle < 150 KB.

## Scene Post-Processing and HUD Bridge (added with the UI overhaul)

- `src/scene/postFx.ts` owns the `EffectComposer` (`RenderPass` -> `UnrealBloomPass` -> `OutputPass`). The bloom threshold is 1.0, so only HDR emissive colours (> 1) glow: rune strokes, pedestal rims, ring markers, the crystal core.
- `src/scene/adaptiveQuality.ts` permanently disables bloom when more than half of a 120-frame window exceeds `FRAME_BUDGET_MS` or runs below ~30 fps. The composer and every pass are disposed in the `SceneRoot` teardown.
- The render loop and the HUD share exactly one signal: `src/scene/sceneSignals.ts` (a boolean, no secrets, no React, no Three.js). The HUD writes it from `PipelineStatusIndicator`; the loop reads it once per frame.
- `SceneRoot` handles `webglcontextlost`: it pauses the loop, waits 4 s for `webglcontextrestored` (then remounts a fresh canvas), and otherwise renders `WebGLFallback`.
- The procedural reflection environment (`RoomEnvironment` through `PMREMGenerator`) is generated once and registered for disposal. No external HDRI.
- UI panels are mounted by `src/components/CommandDock.tsx`. Panels stay mounted after first visit (hidden, not unmounted) so P2P connections survive tab switches.
