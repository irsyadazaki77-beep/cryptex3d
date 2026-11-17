# Implementation Plan: Vault Visual Drama and Tactile Feedback

## Overview

Implementation is in TypeScript on the existing Three.js scene, React HUD and Web Audio layer. Work proceeds bottom-up: bridge state and shared helpers first, then audio, vault shaders, the tripwire glitch, Horcrux tethers and the data stream, then HUD wiring. The last tasks run `npx tsc --noEmit`, `npx vitest --run`, `npm run build`, then commit and push to `main`.

Steering applies throughout: no React setters in the render loop, 4 ms frame budget, everything disposed through `SceneRegistry`, `sceneSignals` unchanged, carrier pixels and `THREE.NoColorSpace` untouched, bloom threshold 1.0, no `console.*` and no secrets in new code.

## Tasks

- [ ] 1. Bridge state and shared helpers
  - [ ] 1.1 Extend `src/scene/sceneBridge.ts`
    - Add `'stream-start' | 'stream-end'` to `SceneEffect`
    - Add `setHorcruxMode` / `getHorcruxMode` (notify only on change), `setDanger` / `getDanger`, and the `effectListenerCount()` test hook
    - Make `resetSceneBridge()` reset the new state
    - _Requirements: 1.6, 4.1, 4.6, 5.4_

  - [ ] 1.2 Create `src/scene/cameraShake.ts` and hook it into `OrbitControlsWrapper.update()`
    - Implement `setShake`, `applyShake`, `removeShake` using plain numbers
    - Update the wrapper to run `removeShake(camera); controls.update(); applyShake(camera);`
    - _Requirements: 9.2_

  - [ ] 1.3 Create `src/components/tactile.ts`
    - Export `TRIPWIRE_VIBRATION = [200, 80, 200, 80, 400]` and `triggerTripwireVibration(nav)`
    - Guard with `typeof nav?.vibrate === 'function'` and `try/catch`
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 1.4 Write property test for camera shake
    - **Property 13: Camera shake is damped and reversible**
    - **Validates: Requirements 9.2**

- [ ] 2. Audio engine, procedural effects and bridge
  - [ ] 2.1 Extend `src/core/audio/AudioEngine.ts` with mute support
    - Add `muted`, `setMuted` (store and restore pre-mute gain, apply pending flag in `initialize()`), `canPlay`, `onMuteChange`
    - _Requirements: 10.1, 10.2, 10.3_

  - [ ] 2.2 Create `src/core/audio/proceduralFx.ts`
    - Implement `riseFrequency`, `startHarmonicRise` (returns `StreamTone` with `finish` and `stop`, 30 s cap) and `playTripwire` (noise through band-pass plus alternating alarm tone, 1500 ms)
    - Guard every entry point with `engine.canPlay` and `try/catch`; no Three.js, React or audio files
    - _Requirements: 2.4, 2.5, 8.4, 9.4, 9.5_

  - [ ] 2.3 Subscribe the audio bridge in `src/scene/artifacts/audioBridge.ts`
    - Dynamic import `proceduralFx` and register one `onSceneEffect` listener inside the `.then` block
    - Map `stream-start` to `startHarmonicRise`, `stream-end` to `finish`, `shatter` to `playTripwire`; remove the listener and stop the tone in cleanup
    - _Requirements: 2.4, 5.4, 8.4, 9.4_

  - [ ]* 2.4 Write property test for mute round trip
    - **Property 15: Mute round trip restores gain**
    - **Validates: Requirements 10.1, 10.2, 10.3**

  - [ ]* 2.5 Write property test for harmonic rise
    - **Property 12: Harmonic rise is monotonic**
    - **Validates: Requirements 8.4**

  - [ ]* 2.6 Write property test for quiet audio states
    - **Property 3: Quiet audio states create no sound**
    - **Validates: Requirements 2.5, 9.5**

- [ ] 3. Vault shaders
  - [ ] 3.1 Create `src/scene/artifacts/vaultShaders.ts`
    - Implement `getVaultUniforms` (one hub per registry via `WeakMap`), `createVaultMaterial`, and TS helpers `fresnel`, `easeToward`, `runeIntensity`
    - GLSL: Fresnel rim, 3-octave ridged rune noise, HDR rune and rim output above 1, `uDanger` crimson override, `uXRayMode` cyan tint; crystal variant transparent with Fresnel alpha
    - _Requirements: 7.1, 7.2, 7.3, 7.6_

  - [ ] 3.2 Create `src/scene/artifacts/VaultUniformDriver.ts`
    - Write `uTime`, ease `uEnergy` from `sceneSignals` pipeline flag and `uXRayMode` from the X-Ray lens flag, set `uDanger` from `getDanger()`, with no allocation
    - _Requirements: 7.3, 7.4, 7.5, 9.3_

  - [ ] 3.3 Switch `ObsidianMonolith.ts` to the vault material
    - Keep geometry, picking and state emission; write hover glow to `uHover`; dispose the material
    - _Requirements: 7.1, 7.7_

  - [ ] 3.4 Switch `CryptexRing.ts` segments to the vault material
    - Drive `uPulse`, `uRuneColor` (indigo to emerald lerp) and `uHover`; keep the marker material and Spatial Key output
    - _Requirements: 7.1, 7.7_

  - [ ] 3.5 Switch `EtherealCrystal.ts` to the vault crystal material
    - Keep the HDR core mesh and the exported `advanceGlowProgress` and `glowIntensity`
    - _Requirements: 7.1, 7.7_

  - [ ]* 3.6 Write property test for shared uniforms
    - **Property 9: Shared shader uniforms are single values**
    - **Validates: Requirements 7.3**

  - [ ]* 3.7 Write property test for easing
    - **Property 10: Easing stays in range and moves toward the target**
    - **Validates: Requirements 7.4, 7.5**

  - [ ]* 3.8 Write unit tests for vault shaders and artifacts
    - Assert `ShaderMaterial` type, shader source contains the Fresnel and rune functions, and existing artifact tests still pass
    - _Requirements: 7.1, 7.2, 7.6, 7.7_

- [ ] 4. Tripwire glitch and post-processing
  - [ ] 4.1 Create `src/scene/artifacts/TripwireGlitch.ts`
    - Export `GLITCH_DURATION_MS`, `crimsonEnvelope`, `shakeOffset`, `stepGlitch`; implement `createTripwireGlitch` as the sole writer of glitch level, danger and shake
    - Restart on a second `'shatter'`; read `prefers-reduced-motion` once with a `matchMedia` guard; reset outputs and unsubscribe in cleanup
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 9.2, 9.3, 9.6_

  - [ ] 4.2 Remove glitch-level writes from `ShatterEffect.ts`
    - Delete the three `setGlitchLevel` call sites; keep shard timing, light flash and the `glitchEnvelope` / `shardLife` exports
    - _Requirements: 1.2_

  - [ ] 4.3 Extend `src/scene/postFx.ts`
    - Add an inline tripwire `ShaderPass` (crimson tint, sweeping red scanline pulse) enabled only when level > 0.002, plus `setTripwire` and `setBloomEnabled`; dispose the new pass; keep bloom threshold 1.0
    - _Requirements: 1.3, 5.7, 5.8, 9.1_

  - [ ] 4.4 Update `src/scene/SceneRoot.tsx`
    - Call `postFx.setTripwire(g, now / 1000)`; render through the composer whenever it exists; call `setBloomEnabled(false)` when adaptive quality disables bloom
    - _Requirements: 1.4, 5.1, 5.8, 9.1_

  - [ ]* 4.5 Write property test for glitch timeline
    - **Property 1: Glitch timeline is bounded to 1500 ms**
    - **Validates: Requirements 1.1, 1.4, 9.1, 9.3**

  - [ ]* 4.6 Write property test for glitch restart
    - **Property 2: Restarting the glitch yields a single instance**
    - **Validates: Requirements 1.5**

  - [ ]* 4.7 Write property test for reduced motion
    - **Property 14: Reduced motion disables shake**
    - **Validates: Requirements 9.6**

  - [ ]* 4.8 Write unit tests for post-processing bloom fallback
    - With a mocked composer, `setBloomEnabled(false)` leaves the glitch passes enabled and the bloom threshold stays 1.0; the shatter shard lifetime is unchanged
    - _Requirements: 1.2, 5.7, 5.8_

- [ ] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Horcrux tethers
  - [ ] 6.1 Create `src/scene/artifacts/HorcruxTethers.ts`
    - Build one `LineSegments` with a preallocated geometry (3 curves x 24 segments) and HDR `ShaderMaterial`; read `getHorcruxMode()` once per frame and return early when off
    - Follow live Monolith, Crystal and Ring positions with module-level scratch vectors; pulse once on `'ring-seal'` when the mode is on
    - Unsubscribe and dispose geometry and material through the registry on cleanup
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.3, 4.4, 4.5, 5.2, 5.3, 5.8_

  - [ ]* 6.2 Write property test for flag round trip and tether visibility
    - **Property 4: Horcrux mode flag round trip and tether visibility**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3**

  - [ ]* 6.3 Write property test for tether positions
    - **Property 5: Tethers follow live artifact positions**
    - **Validates: Requirements 3.6**

  - [ ]* 6.4 Write property test for ring-seal pulse
    - **Property 6: Ring-seal pulses tethers once, only in Horcrux mode**
    - **Validates: Requirements 3.7**

- [ ] 7. Data stream particles
  - [ ] 7.1 Create `src/scene/artifacts/DataStreamParticles.ts`
    - One preallocated `THREE.Points` (600 particles, cyan and violet HDR colours, additive blending); export `spiralPosition`, `streamStep`, `STREAM_FADE_MS = 600`
    - Hide when idle with an early return; restart from `fading` on a new `'stream-start'`; dispose through the registry
    - _Requirements: 8.1, 8.2, 8.3, 5.3_

- [ ] 8. HUD wiring and integration
  - [ ] 8.1 Register the new factories in `src/scene/artifacts/defaultArtifacts.ts`
    - Order: `createVaultUniformDriver` first, then artifacts, `createTripwireGlitch`, `createHorcruxTethers`, `createDataStreamParticles`, `controlsFactory`, `audioBridgeFactory`
    - _Requirements: 1.2, 3.6, 7.3_

  - [ ] 8.2 Update `src/components/SceneBridgeEffects.tsx`
    - Fire `'stream-start'` and `'stream-end'` on encrypt-state transitions among `deriving`, `encrypting`, `embedding`, `auditing`; never from decrypt
    - On trip, keep `fireSceneEffect('shatter')` and call `triggerTripwireVibration()`
    - _Requirements: 1.6, 2.1, 2.2, 2.3, 8.1, 8.2, 8.5_

  - [ ] 8.3 Update `src/components/EncryptPanel.tsx`
    - On switch change call `setHorcrux(v); setHorcruxMode(v)`; add an unmount effect calling `setHorcruxMode(false)`
    - _Requirements: 4.1, 4.2_

  - [ ] 8.4 Create `src/components/AudioMuteToggle.tsx` and mount it in `src/App.tsx`
    - Use Lucide `Volume2` / `VolumeX`, HUD styles from `hudStyles.ts`, dynamic import of the audio engine, and `onMuteChange` to mirror state
    - _Requirements: 10.1, 10.2, 10.3_

  - [ ]* 8.5 Write property test for data stream lifecycle
    - **Property 11: Data stream lifecycle**
    - **Validates: Requirements 8.1, 8.2, 8.5**

  - [ ]* 8.6 Write property test for listener leaks
    - **Property 7: No listener leak across mounts**
    - **Validates: Requirements 5.4**

  - [ ]* 8.7 Write property test for carrier pixel integrity
    - **Property 8: Carrier pixels are never modified**
    - **Validates: Requirements 5.5, 5.6**

  - [ ]* 8.8 Write unit and smoke tests for HUD and source rules
    - `SceneBridgeEffects` fires `shatter` on trip; vibration called with and without `navigator.vibrate`, pattern sum at most 1500; tether colours exceed 1; disposal spies for new resources; source scan that new scene files import no `components/`, `store/` or `core/crypto` and contain no `console.`
    - _Requirements: 1.6, 2.1, 2.2, 2.3, 3.5, 4.5, 5.3, 5.9, 6.1_

- [ ] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Final verification and delivery
  - [ ] 10.1 Run `npx tsc --noEmit`
    - Fix every type error before continuing
    - _Requirements: 6.2, 6.3_

  - [ ] 10.2 Run `npx vitest --run`
    - Fix every failing test before continuing
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ] 10.3 Run `npm run build`
    - Fix any build failure before continuing
    - _Requirements: 6.2, 6.3_

  - [ ] 10.4 Commit and push to `main`
    - Only after 10.1, 10.2 and 10.3 all pass: stage the feature files by name, commit with a descriptive message, and run `git push origin main`
    - Withhold the commit and push if any earlier step failed
    - _Requirements: 6.2, 6.3_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use fast-check with at least 100 iterations and the tag `Feature: vault-visual-drama-tactile-feedback, Property N: <title>`
- Frame-budget requirements 5.1 and 5.2 are checked manually with the existing `scene-frame-overrun` event, not by automated tests
- Tasks 10.1 to 10.4 must run in order, since each gates the next

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "2.1", "3.1"] },
    { "id": 1, "tasks": ["1.4", "2.2", "2.4", "3.2", "3.3", "3.4", "3.5", "3.7", "4.1", "4.3", "6.1", "7.1"] },
    { "id": 2, "tasks": ["2.3", "2.5", "2.6", "3.6", "3.8", "4.2", "4.4", "4.5", "4.6", "4.7", "4.8", "6.2", "6.3", "6.4", "8.1", "8.2", "8.3", "8.4"] },
    { "id": 3, "tasks": ["8.5", "8.6", "8.7", "8.8"] },
    { "id": 4, "tasks": ["10.1"] },
    { "id": 5, "tasks": ["10.2"] },
    { "id": 6, "tasks": ["10.3"] },
    { "id": 7, "tasks": ["10.4"] }
  ]
}
```
