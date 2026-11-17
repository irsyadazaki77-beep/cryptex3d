# Implementation Plan: Cryptex3D

## Overview

Cryptex3D is a zero-knowledge, 100% browser-native encrypted dead-drop disguised as an interactive 3D atmospheric vault. The implementation is ordered by dependency: project scaffolding and state foundation first, then core workers (crypto, stego, auditor), then the Three.js scene, then transport, audio, HUD panels, demo mode, and finally tests and repo hygiene. All heavy computation runs in dedicated Web Workers; the main thread is reserved exclusively for the Three.js render loop and React UI.

**Technology stack**: TypeScript · React 19 · Vite 6 · Tailwind CSS v4 · Three.js · Zustand · fast-check · Vitest

---

## Tasks

- [x] 1. Project scaffolding and build configuration
  - [x] 1.1 Initialise Vite 6 project with React 19 and TypeScript strict-mode
    - Run `npm create vite@latest` selecting React + TypeScript template; set `tsconfig.json` to `"strict": true`, `"target": "ES2022"`, `"module": "ESNext"`, `"moduleResolution": "Bundler"`
    - Install all required packages: `react react-dom three @react-three/fiber zustand tailwindcss vite vitest fast-check lucide-react qrcode @huggingface/transformers typescript @types/react @types/react-dom @types/three @types/qrcode`
    - Create the directory structure: `src/components/`, `src/scene/artifacts/`, `src/scene/controls/`, `src/core/crypto/`, `src/core/stego/`, `src/core/auditor/`, `src/core/p2p/`, `src/core/audio/`, `src/store/`, `tests/unit/`, `tests/property/`, `tests/integration/`
    - _Requirements: 14.1_

  - [x] 1.2 Configure Vite bundle splitting, CSP, and gzip budget
    - In `vite.config.ts`, configure `build.rollupOptions.output.manualChunks` to split Three.js, Tailwind, and all Worker modules as dynamic import chunks so the initial JS bundle does not exceed 150 KB gzipped
    - Add `Content-Security-Policy: default-src 'self'; worker-src 'self' blob:` as a response header via `vite-plugin-html` or as an HTML `<meta http-equiv>` tag
    - Configure `vitest` in the same config file: include `tests/**/*.test.ts`, set `testTimeout` to 30 000 ms for property tests
    - _Requirements: 11.4, 12.4_

  - [x] 1.3 Add MIT LICENSE file and skeleton README
    - Create `LICENSE` with the standard MIT license text (copyright holder: `zaki5544`)
    - Create `README.md` with sections: Project Overview, Architecture Notes, Prerequisites (Node.js ≥ 20), Install (`npm install`), Dev server (`npm run dev` → `http://localhost:5173`), Build (`npm run build`), Test (`npm run test`)
    - _Requirements: 14.2, 14.3_

- [x] 2. Zustand VaultStore
  - [x] 2.1 Define all TypeScript interfaces and implement VaultStore
    - Create `src/store/types.ts` exporting: `SpatialKeySnapshot`, `PipelineStatus`, `AuditReport`, `P2PStatus`, `EncryptionBundle ({ iv, salt, ciphertext, tag })`, `WorkerMessage`, `PipelineState` union type (`'idle' | 'deriving' | 'encrypting' | 'embedding' | 'auditing' | 'transferring' | 'extracting' | 'decrypting' | 'complete' | 'error'`)
    - Create `src/store/vaultStore.ts` using Zustand `create`; store shape: `spatialKeySnapshot`, `encryptStatus`, `decryptStatus`, `auditReport`, `p2pStatus`, `stegoCarrier`, `decryptedPayload`, `lastError`, plus actions: `setSpatialKeySnapshot`, `dispatchEncryptEmbed`, `dispatchExtractDecrypt`, `setAuditReport`, `setP2PStatus`, `setStegoCarrier`, `setDecryptedPayload`, `setLastError`, `setPipelineState`
    - _Requirements: 9.4, 9.5, 9.6_

- [x] 3. SpatialKeySerializer
  - [x] 3.1 Implement SpatialKeySerializer (pure, no Three.js imports)
    - Create `src/scene/SpatialKeySerializer.ts`; export a class with method `serialize(monolithRot: [number,number,number], ringSegments: number[], crystalActivated: boolean): SpatialKeySnapshot`
    - Validate inputs: rotation floats must be in `[0.0, 360.0)`, ring segment integers in `[0,9]`, crystalActivated boolean; throw a typed `SnapshotValidationError` with the failing field name on any out-of-range value; do NOT update the store on invalid input
    - Serialize fields in fixed deterministic order (monolithRotationX, monolithRotationY, monolithRotationZ, ringSegmentPositions[0..7], crystalActivated) as a UTF-8 JSON string; compute SHA-256 via `crypto.subtle.digest` and store result as a 64-character lowercase hex string in `serializedHash`
    - Subscribe to scene event emitter; on each artifact state-change event call `serialize` and dispatch `setSpatialKeySnapshot` to the VaultStore within 100 ms; emit an error event (not a store write) when validation fails
    - Zero Three.js imports; communicate with the scene only through an `EventEmitter` or `EventTarget`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x]* 3.2 Write property test for spatial key hash injectivity (Property 11)
    - **Property 11: Spatial Key Hash Injectivity** — `∀ K ≠ K′: SHA-256(K) ≠ SHA-256(K′)`
    - Use `fast-check` with 500 iterations; generate pairs of `SpatialKeySnapshot` values that differ in exactly one field; assert `serialize(K).serializedHash !== serialize(K′).serializedHash`
    - **Validates: Requirements 2.3, 3.1, 15.7**

  - [x]* 3.3 Write property test for spatial key sensitivity (Property 3)
    - **Property 3: Spatial Key Sensitivity** — single-field change → different PBKDF2 salt
    - Use `fast-check` with 500 iterations; generate K and K′ differing by one field; compute the PBKDF2 salt formula `SHA-256(passphrase + serializedHash)[0..15]` for both; assert the salts differ
    - **Validates: Requirements 2.3, 15.7**

- [x] 4. CryptoWorker (AES-256-GCM + PBKDF2)
  - [x] 4.1 Implement KeyDeriver
    - Create `src/core/crypto/KeyDeriver.ts`; export `deriveKey(passphrase: string, spatialKeyHash: string): Promise<{ key: CryptoKey; salt: Uint8Array }>`
    - Validate passphrase length 8–64 characters; throw `InvalidPassphraseError` if out of range
    - Compute `salt = SHA-256(passphrase + spatialKeyHash)[0..15]` (16 bytes) via `crypto.subtle.digest`
    - Call `crypto.subtle.importKey` on the passphrase bytes, then `crypto.subtle.deriveKey` with PBKDF2-HMAC-SHA-256 at 310 000 iterations, `keyUsages: ["encrypt","decrypt"]`, `extractable: false`, output: AES-GCM 256-bit key
    - _Requirements: 3.1, 3.4_

  - [x] 4.2 Implement Encryptor and Decryptor
    - Create `src/core/crypto/Encryptor.ts`; export `encrypt(key: CryptoKey, payload: Uint8Array): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }>` using `crypto.getRandomValues` for 12-byte IV and `crypto.subtle.encrypt` with AES-GCM
    - Create `src/core/crypto/Decryptor.ts`; export `decrypt(key: CryptoKey, iv: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array>`; on `DOMException` (AES-GCM tag mismatch) rethrow as typed `AuthFailError`
    - _Requirements: 3.3, 3.5, 3.6, 3.7, 3.8_

  - [x] 4.3 Implement CryptoWorker message handler
    - Create `src/core/crypto/CryptoWorker.ts` as a dedicated Web Worker (`new Worker(import.meta.url, { type: 'module' })`)
    - Handle `{ op: "encrypt", payload, passphrase, spatialKeySnapshot }`: validate passphrase; call `KeyDeriver` then `Encryptor`; post `{ iv, salt, ciphertext, tag }` back to main thread; post `{ error: "INVALID_PASSPHRASE" }` on validation failure
    - Handle `{ op: "decrypt", ciphertext, iv, salt, passphrase, spatialKeySnapshot }`: reconstruct key from stored salt and current `spatialKeySnapshot.serializedHash`; call `Decryptor`; post `{ plaintext }` on success or `{ error: "AUTH_FAIL" }` on tag mismatch
    - Worker must remain alive (long-lived); main thread auto-terminates and restarts it after 30 s idle
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 3.8, 11.1, 11.2_

  - [x]* 4.4 Write property test for AES-GCM round-trip (Property 1 partial)
    - **Property 1: Round-Trip Fidelity (crypto layer)** — `∀ P[1..256000], S[8..64], K: decrypt(encrypt(P,S,K), S, K) === P`
    - Use `fast-check` with 500 iterations; generate arbitrary `Uint8Array` payloads, passphrases, and `SpatialKeySnapshot` values within valid ranges; assert byte-for-byte equality
    - **Validates: Requirements 3.6, 15.3**

  - [x]* 4.5 Write property test for wrong-key rejection (Property 2)
    - **Property 2: Wrong-Key Rejection** — `∀ K′ ≠ K: decrypt(encrypt(P,S,K), S, K′) throws AuthError`
    - Use `fast-check` with 500 iterations; generate K and K′ differing in at least one field; assert `Decryptor` throws `AuthFailError` and returns no bytes
    - **Validates: Requirements 3.7, 15.5**

- [x] 5. Checkpoint — verify CryptoWorker and SpatialKeySerializer
  - Ensure all tests pass for tasks 3 and 4; manually run `npm run test -- --run` and confirm zero failures before proceeding. Ask the user if any questions arise.

- [x] 6. StegoWorker (LSB embed/extract)
  - [x] 6.1 Implement LSBEmbedder
    - Create `src/core/stego/LSBEmbedder.ts`; export `embed(carrierBuffer: Uint8ClampedArray, payload: Uint8Array): Uint8ClampedArray`
    - Throw `PayloadTooLargeError` (typed) before any pixel modification if `payload.byteLength > 256000`
    - Write `BitstreamLayout` into LSBs of R, G, B channels only (skip A): magic header `[0x43,0x52,0x59,0x50,0x54,0x33,0x44,0x00]` (8 bytes) + big-endian uint32 payload length + ciphertext bytes + SHA-256 checksum over header + length + ciphertext (32 bytes)
    - Only the LSB of each consumed channel byte changes; all other bits in R, G, B, and all bits in A remain unchanged
    - _Requirements: 4.1, 4.3, 4.6_

  - [x] 6.2 Implement LSBExtractor
    - Create `src/core/stego/LSBExtractor.ts`; export `extract(carrierBuffer: Uint8ClampedArray): Uint8Array`
    - Read bitstream from LSBs of R, G, B channels; verify magic header bytes exactly; post/throw `BadMagicError` if mismatch without returning any bytes
    - After magic is confirmed, verify SHA-256 checksum over `header + length + ciphertext`; throw `ChecksumFailError` if mismatch
    - Return ciphertext bytes only on full verification success
    - _Requirements: 4.4, 4.5, 13.1_

  - [x] 6.3 Implement StegoWorker message handler
    - Create `src/core/stego/StegoWorker.ts` as a dedicated Web Worker
    - Handle `{ op: "embed", carrierPNG: Uint8Array, ciphertext, iv, salt }`: parse PNG to `Uint8ClampedArray` via `OffscreenCanvas`/`ImageData`; call `LSBEmbedder`; re-encode result as PNG via `OffscreenCanvas.toBlob(..., 'image/png')` (no quality arg); post `{ stegoCarrier: Uint8Array }`
    - Handle `{ op: "extract", carrierPNG: Uint8Array }`: decode PNG to pixel buffer; call `LSBExtractor`; post `{ ciphertext, iv, salt }` or error
    - _Requirements: 4.1, 4.4, 4.7, 11.1_

  - [x]* 6.4 Write property test for LSB round-trip (Property 9)
    - **Property 9: LSB Round-Trip** — `∀ payload[1..256000]: extract(embed(carrier, payload)) === payload`
    - Use `fast-check` with 500 iterations over `Uint8Array` payloads; create a 1024×1024 RGBA test carrier; assert byte-for-byte equality
    - **Validates: Requirements 4.2, 15.4**

  - [x]* 6.5 Write property test for payload size guard (Property 5)
    - **Property 5: Payload Size Invariant** — `∀ payload.byteLength > 256000: embed throws PayloadTooLargeError, carrier unchanged`
    - Use `fast-check` with 500 iterations; generate oversized payloads; assert `PayloadTooLargeError` is thrown and carrier buffer is bitwise identical to its pre-call state
    - **Validates: Requirements 4.6, 15.6**

  - [x]* 6.6 Write property test for losslessness invariant (Property 6)
    - **Property 6: Losslessness Invariant** — after embed, only LSB of consumed R/G/B bytes changes; A channel and upper bits are untouched
    - Use `fast-check` with 500 iterations; embed a payload; compare every bit except LSBs of consumed channel bytes against the original carrier
    - **Validates: Requirements 4.3**

  - [x]* 6.7 Write property test for carrier integrity detection (Property 4)
    - **Property 4: Carrier Integrity Detection** — any post-embed pixel modification causes `CHECKSUM_FAIL`
    - Use `fast-check` with 500 iterations; embed a valid payload; randomly flip one non-LSB bit in the carrier; assert `LSBExtractor` throws `ChecksumFailError` without returning bytes
    - **Validates: Requirements 4.5, 13.1**

- [x] 7. AuditorWorker (entropy audit)
  - [x] 7.1 Implement chi-square, Shannon entropy, and LSB-pair analyzers
    - Create `src/core/auditor/ChiSquareTest.ts`: compute chi-square statistic over 256-bucket byte frequency distribution of the LSB plane; return p-value
    - Create `src/core/auditor/ShannonEntropyCalc.ts`: compute Shannon entropy of the LSB plane in bits/byte (8.0 = perfectly uniform)
    - Create `src/core/auditor/LSBPairAnalyzer.ts`: RS steganalysis — compute regular/singular group ratios for LSB flipping; return anomaly score
    - _Requirements: 5.1_

  - [x] 7.2 Implement HeuristicScorer and AuditReportBuilder
    - Create `src/core/auditor/HeuristicScorer.ts`: default pure-JS weighted scoring combining chi-square p-value, Shannon entropy delta, and LSB-pair anomaly into a 0–100 score; lazy-load `@huggingface/transformers` only if `advancedAudit` flag is set; clamp final score to `[0, 100]`
    - Create `src/core/auditor/AuditReportBuilder.ts`: assemble `AuditReport { score, warnings: string[] (≤10 entries, each ≤200 chars), recommendation: string (≤500 chars) }`
    - _Requirements: 5.2, 5.3, 5.4_

  - [x] 7.3 Implement AuditorWorker message handler
    - Create `src/core/auditor/AuditorWorker.ts` as a dedicated Web Worker
    - Handle `{ op: "audit", carrierPNG: Uint8Array, advancedAudit?: boolean }`: run all analysis on `Uint8ClampedArray` entirely off the main thread; post `AuditReport`; post `{ error: "AUDIT_FAIL" }` on any exception
    - _Requirements: 5.1, 5.2, 5.7, 11.1_

- [x] 8. Worker lifecycle management (idle timeout + restart)
  - [x] 8.1 Implement Worker manager with 30-second idle timeout
    - Create `src/core/WorkerManager.ts`; export `createManagedWorker(url: string | URL): ManagedWorker` that wraps a `Worker`, starts a 30-second inactivity timer on each message received, calls `worker.terminate()` on timeout, and transparently restarts the Worker on the next outgoing message
    - Wire CryptoWorker, StegoWorker, and AuditorWorker through `WorkerManager` in the VaultStore actions
    - _Requirements: 11.2_

- [x] 9. Checkpoint — verify all Workers
  - Run `npm run test -- --run`; confirm all crypto, stego, and auditor unit and property tests pass with zero failures. Ask the user if any questions arise.

- [x] 10. Three.js scene
  - [x] 10.1 Implement SceneRoot with WebGL lifecycle management
    - Create `src/scene/SceneRoot.tsx`; mount `WebGLRenderer` on a `<canvas>` ref using `useEffect`; start `requestAnimationFrame` loop targeting ≤ 4 ms/frame main-thread time; handle canvas resize via `ResizeObserver`
    - On `WebGLRenderer` construction failure or `canvas.getContext("webgl2")` returning null, set a `webglUnavailable` flag in component state to trigger `WebGLFallback`
    - On unmount, call `dispose()` on all geometries, materials, textures, and the renderer
    - _Requirements: 1.1, 1.6, 1.7_

  - [x] 10.2 Implement ObsidianMonolith artifact
    - Create `src/scene/artifacts/ObsidianMonolith.tsx`; use beveled `BoxGeometry` with a PBR `MeshStandardMaterial` (dark roughness ~0.1, metalness ~0.9)
    - Attach `onPointerDown`/`onPointerMove`/`onPointerUp` handlers for drag-rotation; on each `onPointerMove` emit `{ x, y, z }` Euler angles (each in `[0, 2π)`) via the scene event emitter
    - _Requirements: 1.2_

  - [x] 10.3 Implement CryptexRing artifact with 8 click-to-rotate segments
    - Create `src/scene/artifacts/CryptexRing.tsx`; render 8 `CylinderGeometry` segments stacked concentrically
    - On each segment click, advance position `(current + 1) % 10` cyclically and emit the full 8-element position array via the scene event emitter
    - _Requirements: 1.3_

  - [x] 10.4 Implement EtherealCrystal artifact with hover glow
    - Create `src/scene/artifacts/EtherealCrystal.tsx`; use `IcosahedronGeometry` with `MeshPhysicalMaterial` (transmission, emissive)
    - On `onPointerEnter`: start 300 ms glow animation (increase `emissiveIntensity`) and set `crystalActivated: true` in VaultStore; on `onPointerLeave`: reverse animation over 300 ms and set `crystalActivated: false`
    - _Requirements: 1.4_

  - [x] 10.5 Implement OrbitControls wrapper and ArtifactRaycaster
    - Create `src/scene/controls/OrbitControlsWrapper.tsx`; wrap Three.js `OrbitControls`; expose `enable()`/`disable()` and auto-disable during any artifact interaction (pointer down on Monolith, hover on Crystal, click on Ring segment)
    - Create `src/scene/controls/ArtifactRaycaster.ts`; run per-frame raycasting against all three artifact meshes; route `pointerdown`, `pointermove`, `pointerup`, `pointerenter`, `pointerleave` events to the correct artifact handler
    - _Requirements: 1.5_

  - [x] 10.6 Implement WebGLFallback component
    - Create `src/scene/WebGLFallback.tsx`; render an accessible error panel explaining WebGL is unavailable
    - Include a text input accepting exactly 64 hexadecimal characters as a manual Spatial Key override; validate on submit — if the string is not exactly 64 hex chars, display "Invalid spatial key: must be exactly 64 hexadecimal characters" and do not update the store; if valid, write `serializedHash` directly to `vaultStore.spatialKeySnapshot`
    - _Requirements: 1.7_

  - [x] 10.7 Wire scene event emitter to SpatialKeySerializer
    - Instantiate `SpatialKeySerializer` in `SceneRoot`; subscribe to artifact state-change events emitted by Monolith, Ring, and Crystal; call `serialize(...)` and dispatch `setSpatialKeySnapshot` to VaultStore within 100 ms of each event
    - _Requirements: 2.1, 2.5_

- [x] 11. P2P transport layer
  - [x] 11.1 Implement P2PManager and SDPNegotiator
    - Create `src/core/p2p/P2PManager.ts`; create `RTCPeerConnection` with one DataChannel on `createOffer()`; expose `createOffer(): Promise<string>`, `acceptAnswer(sdp: string): Promise<void>`, `sendData(data: Uint8Array): void`
    - Create `src/core/p2p/SDPNegotiator.ts`; format SDP as copyable monospace text; use the `qrcode` library to generate a scannable QR code data URL; expose both via `getOfferText()` and `getOfferQRDataURL()`
    - Start a 30-second ICE timeout timer in `P2PManager`; emit `iceTimeout` event if no connected candidate pair before expiry
    - _Requirements: 6.1, 6.2, 6.5_

  - [x] 11.2 Implement DataChannelHandler with 16 KB chunking and backpressure
    - Create `src/core/p2p/DataChannelHandler.ts`; on send, split `Uint8Array` into 16 KB chunks; apply backpressure by checking `RTCDataChannel.bufferedAmount` before each chunk and waiting if above threshold; emit `progress` events (bytes transferred / total)
    - On receive, reassemble chunks in order using a prepended 4-byte chunk-index header; emit `complete` once all chunks are acknowledged
    - On mid-session WebRTC failure, call `activateFallback()` on `BroadcastChannelFallback` automatically
    - _Requirements: 6.3, 6.4, 6.6_

  - [x] 11.3 Implement BroadcastChannelFallback
    - Create `src/core/p2p/BroadcastChannelFallback.ts`; open `BroadcastChannel("cryptex3d-p2p")` on construction; expose `send(data: Uint8Array): void` and listen for `message` events; emit a `received` event with the carrier bytes on each message
    - Activate automatically when `RTCPeerConnection` is unavailable or when the user selects "Same-Device Mode"; stay open and ready for subsequent transfers without page reload
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 12. Web Audio Engine
  - [x] 12.1 Implement AudioEngine and AmbientSynthesizer
    - Create `src/core/audio/AudioEngine.ts`; create `AudioContext` lazily on the first user interaction (call `audioContext.resume()` to satisfy browser autoplay policy); if `AudioContext` construction fails, suppress silently without displaying any error
    - Create `src/core/audio/AmbientSynthesizer.ts`; build a procedural eerie soundscape using `OscillatorNode` pairs and a `ConvolverNode` for reverb; start on `AudioEngine` ready; run continuously while the application is active
    - _Requirements: 8.1, 8.2, 8.5_

  - [x] 12.2 Implement SpatialMixer and TactileSFX
    - Create `src/core/audio/SpatialMixer.ts`; subscribe to camera position changes from the Three.js scene; update `PannerNode` position and `GainNode` attenuation to match camera XYZ
    - Create `src/core/audio/TactileSFX.ts`; map segment indices 0–9 to 10 discrete frequencies monotonically (index 0 = lowest, index 9 = highest); on each ring segment rotation event play a short synthesized click using `OscillatorNode` + `GainNode` envelope
    - _Requirements: 8.3, 8.4_

- [x] 13. React HUD panels
  - [x] 13.1 Implement EncryptPanel
    - Create `src/components/EncryptPanel.tsx` with glassmorphic Tailwind styling
    - File drop zone (drag-and-drop + `<input type="file">`) accepting any file; reject files > 256 000 bytes with error "File too large — maximum is 250 KB"; passphrase `<input type="password">` with 8–64 character validation
    - On "Encrypt & Embed" click, dispatch `dispatchEncryptEmbed(file, passphrase)` to VaultStore; do not dispatch if file or passphrase is invalid
    - _Requirements: 9.1, 9.2_

  - [x] 13.2 Implement DecryptPanel
    - Create `src/components/DecryptPanel.tsx` with glassmorphic Tailwind styling
    - Passphrase input (8–64 chars); "Extract & Decrypt" button dispatches `dispatchExtractDecrypt(passphrase)` to VaultStore; on `decryptStatus.state === 'complete'`, present a download link/button for the decrypted file using `URL.createObjectURL`
    - Display retry UI for spatial key mismatch: allow up to 10 consecutive retry attempts on the same carrier; after 10 failures display "Retry limit reached — please re-initiate from the Decrypt panel" and require re-initiation
    - _Requirements: 9.3, 13.3, 13.4_

  - [x] 13.3 Implement AuditPanel
    - Create `src/components/AuditPanel.tsx`; subscribe to `vaultStore.auditReport`
    - When an `AuditReport` is available, display `score` (0–100), all `warnings` (up to 10), and `recommendation`; include an entropy chart (simple bar or gauge)
    - When no audit has been run yet, display placeholder text "No audit has been run yet"
    - When `AuditorWorker` posts `{ error: "AUDIT_FAIL" }`, display "Audit could not be completed"
    - Include "Advanced Audit" toggle that sets `advancedAudit: true` on the next audit request
    - _Requirements: 5.5, 5.6, 5.7_

  - [x] 13.4 Implement P2PPanel
    - Create `src/components/P2PPanel.tsx`; on open, check WebRTC availability and start `P2PManager.createOffer()` if available; display SDP offer as copyable monospace `<textarea>` and as a QR code `<img>`
    - Provide a `<textarea>` for the recipient to paste SDP answer; on paste call `P2PManager.acceptAnswer()`; show transfer progress bar fed by `TransferProgressTracker` byte-count events
    - On ICE timeout event, display "Connection timed out" and a "Switch to Same-Device Mode" button that activates `BroadcastChannelFallback`
    - _Requirements: 6.1, 6.2, 6.4, 6.5_

  - [x] 13.5 Implement SpatialKeyDisplay
    - Create `src/components/SpatialKeyDisplay.tsx`; subscribe to `vaultStore.spatialKeySnapshot.serializedHash`; render the full 64-character hex string in a read-only `<pre>` or monospace `<span>`; update within one render cycle of each snapshot change
    - _Requirements: 9.5_

  - [x] 13.6 Implement pipeline status indicators and error display
    - In `src/components/App.tsx`, subscribe to `vaultStore.encryptStatus.state` and `vaultStore.decryptStatus.state`; render a progress indicator whose label text matches the active state name exactly (`deriving`, `encrypting`, `embedding`, `auditing`, `transferring`, `extracting`, `decrypting`)
    - Display errors from `vaultStore.lastError`; strip any passphrase substrings, AES key bytes, IV bytes, and stack trace text before rendering — never surface raw key material in error messages
    - _Requirements: 9.4, 9.6, 12.1, 12.2_

- [x] 14. DemoModeOrchestrator (Judge Demo Mode)
  - [x] 14.1 Implement DemoModeOrchestrator component
    - Create `src/components/DemoModeOrchestrator.tsx`; render a prominent "Judge Demo Mode" button
    - On click, start a 60-second deadline timer; orchestrate the full pipeline sequentially: (1) set a fixed `SpatialKeySnapshot` with known rotation values, (2) encrypt the 1 024-byte pre-set demo payload using the fixed snapshot and a known passphrase, (3) embed into a carrier PNG, (4) run audit, (5) transfer via `BroadcastChannel("cryptex3d-p2p")` within the same tab, (6) extract, (7) decrypt
    - Update `vaultStore.encryptStatus.state` / `vaultStore.decryptStatus.state` for each stage within 500 ms of each transition; display stage label to the user
    - On completion, display the decrypted payload as a hex string and a "✔ Payload matches original" or "✘ Payload mismatch" indicator from a byte-for-byte comparison
    - If the pipeline has not completed within 60 seconds, abort all in-progress operations and display "Demo timed out"
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 15. Checkpoint — verify UI and demo mode
  - Run `npm run dev` manually and walk through the EncryptPanel → embed → AuditPanel → P2PPanel → DecryptPanel flow. Click "Judge Demo Mode" and confirm it completes in under 60 s. Ask the user if any questions arise.

- [x] 16. Unit tests
  - [x] 16.1 Write unit tests for key derivation determinism
    - `tests/unit/keyDerivation.test.ts`: assert identical passphrase + spatialKeyHash inputs produce identical 256-bit key material (via a test-visible PBKDF2 output); assert any single-character passphrase change produces a different salt
    - _Requirements: 15.1_

  - [x] 16.2 Write unit tests for BitstreamLayout encoding
    - `tests/unit/bitstreamLayout.test.ts`: verify magic header bytes are exactly `[0x43,0x52,0x59,0x50,0x54,0x33,0x44,0x00]`; verify big-endian uint32 payload length encoding; verify SHA-256 checksum covers header + length + ciphertext
    - _Requirements: 15.1_

  - [x] 16.3 Write unit tests for SpatialKeySerializer hash stability
    - `tests/unit/spatialKeySerializer.test.ts`: assert identical `SpatialKeySnapshot` inputs produce identical `serializedHash`; assert rotation-angle quantization is stable across repeated calls
    - _Requirements: 15.1_

  - [x] 16.4 Write unit tests for LSB embed/extract with known byte sequences
    - `tests/unit/lsbEmbedExtract.test.ts`: embed a known 100-byte sequence into a minimal RGBA carrier; extract and assert byte-for-byte equality; test bad-magic rejection; test checksum-fail rejection
    - _Requirements: 15.1_

- [x] 17. Property-based tests
  - [x] 17.1 Write property test for full pipeline round-trip fidelity (Property 1)
    - `tests/property/roundTrip.test.ts`: **Property 1: Round-Trip Fidelity** — `∀ P[1..256000], S[8..64], K: decrypt(extract(embed(carrier, encrypt(P,S,K))), S, K) === P`
    - Use `fast-check` with ≥ 500 iterations; generate arbitrary payloads, passphrases, and `SpatialKeySnapshot` values; pipe through the full crypto + stego pipeline and assert byte-for-byte equality on output
    - **Validates: Requirements 3.6, 15.3**

  - [x] 17.2 Write property test for Cryptex Ring segment cycling (Property 10)
    - `tests/property/ringSegment.test.ts`: **Property 10: Cryptex Ring Segment Cycling** — `∀ P ∈ [0,9], N ≥ 0: position after N clicks === (P + N) % 10`
    - Use `fast-check` with ≥ 500 iterations; generate initial position and click count; simulate clicks on a CryptexRing instance; assert final position equals `(P + N) % 10`
    - **Validates: Requirements 1.3**

  - [x] 17.3 Write property test for Worker non-blocking invariant (Property 7)
    - `tests/property/nonBlocking.test.ts`: **Property 7: 60 fps Non-Blocking Invariant** — no crypto/stego/audit computation runs synchronously on the main thread
    - Start CryptoWorker, StegoWorker, and AuditorWorker concurrently; measure main-thread synchronous execution time per frame using `performance.now()` checkpoints; assert main-thread frame time ≤ 4 ms across ≥ 500 iterations
    - **Validates: Requirements 11.1, 11.2**

  - [x] 17.4 Write property test for no plaintext leakage (Property 8)
    - `tests/property/noLeakage.test.ts`: **Property 8: No Plaintext Leakage** — decrypted payload bytes, raw passphrase, and key material never appear in `console.log`, HUD error messages, or outbound `fetch`/`XMLHttpRequest`
    - Spy on `console.log`, `fetch`, and `XMLHttpRequest.prototype.send` for ≥ 500 decrypt operations with arbitrary payloads; assert none of the spies receive arguments containing payload bytes or passphrase substrings
    - **Validates: Requirements 12.1, 12.2, 12.3**

  - [x] 17.5 Confirm property tests 3.2, 3.3, 4.4, 4.5, 6.4, 6.5, 6.6, 6.7 are wired into Vitest
    - Ensure all property test files created in tasks 3.2, 3.3, 4.4, 4.5, 6.4, 6.5, 6.6, and 6.7 are imported or auto-discovered by Vitest; run `npm run test -- --run` and confirm all 11 properties exercise ≥ 500 iterations
    - _Requirements: 15.2_

- [x] 18. Integration tests
  - [x] 18.1 Write integration test for full pipeline success path
    - `tests/integration/pipelineSuccess.test.ts`: drive the full pipeline through Worker message passing with matching spatial key; assert decrypted output equals original payload byte-for-byte
    - _Requirements: 15.1_

  - [x] 18.2 Write integration test for spatial key mismatch rejection
    - `tests/integration/spatialKeyMismatch.test.ts`: encrypt with K, extract/decrypt with K′ ≠ K; assert `AUTH_FAIL` error and no plaintext output
    - _Requirements: 15.5_

  - [x] 18.3 Write integration test for pipeline latency budget
    - `tests/integration/latencyBudget.test.ts`: time the encrypt + embed + audit sequence for a 100 KB payload; assert completion in < 5 000 ms
    - _Requirements: 15.1_

  - [x] 18.4 Write integration test for BroadcastChannel transfer
    - `tests/integration/broadcastChannel.test.ts`: open two `BroadcastChannel("cryptex3d-p2p")` instances in the same test process; send a carrier via one and receive on the other; assert received bytes are identical in length and content
    - _Requirements: 7.3, 15.1_

- [x] 19. Final README update and repo hygiene
  - [x] 19.1 Update README with final architecture notes and run instructions
    - Expand README to cover: Architecture diagram (reference design.md Mermaid graphs), `src/` directory tree with one-line descriptions of each module, build output (`dist/`), test commands (`npm run test -- --run`), and GitHub Pages deployment note for `zaki5544/cryptex3d`
    - _Requirements: 14.3_

  - [x] 19.2 Verify MIT license and no-backend static build
    - Confirm `LICENSE` contains valid MIT text; run `npm run build` and inspect `dist/` to ensure output is entirely static (HTML, CSS, JS, assets) with no server or Node runtime references
    - Confirm `Content-Security-Policy` header or meta tag is present in the built HTML
    - _Requirements: 14.1, 14.2, 12.4_

- [x] 20. Final checkpoint — full test suite green
  - Run `npm run test -- --run` and confirm exit code 0 with all unit, property, and integration tests passing. Ask the user if any questions arise before closing out the implementation.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP, but all 11 correctness properties should be covered before final submission
- Each task references specific requirements for full traceability to requirements.md
- Property tests for Properties 1–11 are distributed close to the components they validate to catch regressions early
- The design uses TypeScript throughout; all code examples and file extensions should be `.ts` or `.tsx`
- Workers are long-lived and managed by `WorkerManager` (task 8.1); they auto-restart after 30 s idle — do not create a new `Worker` instance per operation
- `extractable: false` on all `CryptoKey` objects is a hard requirement (Req 3.4) — never override this
- The `BroadcastChannel` name `"cryptex3d-p2p"` is a protocol constant; do not change it between sender and receiver tabs
- `canvas.toBlob(..., 'image/png')` with no quality argument is the only acceptable PNG output method (Req 4.7); never use JPEG or WebP for the carrier

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["3.1", "4.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "4.2", "6.1"] },
    { "id": 4, "tasks": ["4.3", "6.2", "7.1"] },
    { "id": 5, "tasks": ["4.4", "4.5", "6.3", "6.4", "6.5", "6.6", "6.7", "7.2", "7.3"] },
    { "id": 6, "tasks": ["8.1"] },
    { "id": 7, "tasks": ["10.1", "11.1", "12.1"] },
    { "id": 8, "tasks": ["10.2", "10.3", "10.4", "10.5", "10.6", "11.2", "11.3", "12.2"] },
    { "id": 9, "tasks": ["10.7"] },
    { "id": 10, "tasks": ["13.1", "13.2", "13.3", "13.4", "13.5", "13.6"] },
    { "id": 11, "tasks": ["14.1"] },
    { "id": 12, "tasks": ["16.1", "16.2", "16.3", "16.4"] },
    { "id": 13, "tasks": ["17.1", "17.2", "17.3", "17.4", "17.5"] },
    { "id": 14, "tasks": ["18.1", "18.2", "18.3", "18.4"] },
    { "id": 15, "tasks": ["19.1", "19.2"] }
  ]
}
```
