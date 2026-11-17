# Requirements Document

## Introduction

This feature adds visual drama and tactile feedback to the Cryptex3D vault scene: a 1.5 second crimson glitch when the Tamper Tripwire fires, and always-visible Horcrux tethers while Horcrux Mode is on.

Verified signal path for the tripwire (read from source):

- `src/store/vaultStore.ts` sets `tripwire.tripped` after three consecutive `AUTH_FAIL` results, or on expiry.
- `src/components/SceneBridgeEffects.tsx` subscribes to the store and calls `fireSceneEffect('shatter')` when `tripwire.tripped` changes from false to true.
- `src/scene/sceneBridge.ts` fans the effect out to listeners registered with `onSceneEffect`. The `SceneEffect` type today is `'shatter' | 'ring-seal'`. The bridge also holds a 0..1 glitch level (`setGlitchLevel` / `getGlitchLevel`).
- `src/scene/artifacts/ShatterEffect.ts` listens for `'shatter'` and writes the glitch level. `src/scene/SceneRoot.tsx` reads `getGlitchLevel()` once per frame and passes it to `postFx.setGlitch`. `CarrierFace.ts` reads the same value into the `uGlitch` uniform.
- `SceneRegistry.events` (`src/scene/sceneRegistry.ts`) is an `EventTarget` for artifact-state and lifecycle events only (`scene-ready`, `scene-frame-overrun`, `scene-disposed`). The tripwire does not travel through it.

The new glitch therefore attaches to the existing `'shatter'` effect on `sceneBridge`, alongside `ShatterEffect`. Project steering applies: no React setters in the render loop, at most 4 ms per frame, disposal of all GPU resources, untouched carrier `Uint8ClampedArray`, `THREE.NoColorSpace` on carrier textures, bloom threshold 1.0, and `sceneSignals` as the only HUD-to-loop signal module.

## Glossary

- **Scene**: The Three.js render layer under `src/scene/`.
- **Scene_Bridge**: The module `src/scene/sceneBridge.ts`, a one-way channel between the HUD and the Scene.
- **Scene_Registry**: The `SceneRegistry` class in `src/scene/sceneRegistry.ts`.
- **Tripwire**: The tamper counter in `src/store/tripwire.ts`. It trips after three consecutive `AUTH_FAIL` results or on expiry.
- **Shatter_Effect**: The existing crimson shard burst in `src/scene/artifacts/ShatterEffect.ts`, triggered by the `'shatter'` Scene_Effect.
- **Crimson_Glitch**: The new 1.5 second screen-space glitch in crimson (`#ef4444`), driven by the glitch level and the post-processing RGB-split pass.
- **Horcrux_Mode**: The mode that splits a secret into three shards (PNG, WAV, ring-bound token).
- **Horcrux_Tether**: A line drawn in the Scene between two of the three artifacts (Obsidian Monolith, Ethereal Crystal, Cryptex Ring) that hold Horcrux shards.
- **Tactile_Feedback**: A short non-visual response to a user action, limited to device vibration and the existing audio engine's sound effects.
- **HUD**: The React overlay under `src/components/`.
- **Render_Loop**: The `requestAnimationFrame` loop in `src/scene/SceneRoot.tsx`.
- **Frame_Budget**: The 4 ms main-thread limit per frame for Scene work.
- **Carrier_Pixels**: The `Uint8ClampedArray` RGBA buffer of the carrier PNG.

## Requirements

### Requirement 1: Crimson glitch on tripwire

**User Story:** As a user, I want a dramatic crimson glitch when the tripwire fires, so that I immediately understand the vault has self-destructed.

#### Acceptance Criteria

1. WHEN the Scene_Bridge dispatches the `'shatter'` Scene_Effect, THE Scene SHALL play the Crimson_Glitch for 1500 ms, plus or minus 100 ms.
2. WHEN the Scene_Bridge dispatches the `'shatter'` Scene_Effect, THE Scene SHALL play the Crimson_Glitch at the same time as the Shatter_Effect without altering the Shatter_Effect timing or particle behavior.
3. THE Scene SHALL render the Crimson_Glitch using the crimson accent `#ef4444` with a crimson glow matching `0 0 20px rgba(239, 68, 68, 0.7)` on the HUD error banner.
4. WHEN the Crimson_Glitch reaches 1500 ms, THE Scene SHALL set the glitch level to 0 and skip the RGB-split pass.
5. WHEN a second `'shatter'` Scene_Effect arrives while a Crimson_Glitch is playing, THE Scene SHALL restart the Crimson_Glitch from its beginning with a single active instance.
6. THE Tripwire path SHALL continue to reach the Scene through `fireSceneEffect('shatter')` in `SceneBridgeEffects.tsx`, with no new effect type required for the glitch.

### Requirement 2: Tactile feedback on tripwire

**User Story:** As a user, I want physical and audible feedback at the moment of tripwire, so that the event is felt as well as seen.

#### Acceptance Criteria

1. WHEN the Scene_Bridge dispatches the `'shatter'` Scene_Effect, THE HUD SHALL trigger one Tactile_Feedback pattern with a total duration of at most 1500 ms.
2. WHERE the browser exposes `navigator.vibrate`, THE HUD SHALL call it with the Tactile_Feedback pattern.
3. IF `navigator.vibrate` is unavailable, THEN THE HUD SHALL skip vibration and play only the audio cue.
4. WHEN the Scene_Bridge dispatches the `'shatter'` Scene_Effect, THE audio engine SHALL play one alarm sound effect through the existing `src/core/audio` modules.
5. IF the audio context is suspended or unavailable, THEN THE audio engine SHALL skip the cue without raising an error to the HUD.

### Requirement 3: Always-visible Horcrux tethers

**User Story:** As a user, I want visible tethers between Horcrux artifacts while Horcrux Mode is on, so that I can see the shards are bound together.

#### Acceptance Criteria

1. WHILE Horcrux_Mode is on, THE Scene SHALL render a Horcrux_Tether between each pair of the Obsidian Monolith, the Ethereal Crystal, and the Cryptex Ring, for three tethers in total.
2. WHILE Horcrux_Mode is on, THE Scene SHALL keep every Horcrux_Tether visible without requiring pointer hover, selection, or an active pipeline.
3. WHEN Horcrux_Mode changes from off to on, THE Scene SHALL show the tethers within one frame of the change being read by the Render_Loop.
4. WHEN Horcrux_Mode changes from on to off, THE Scene SHALL hide all Horcrux_Tethers within one frame of the change being read by the Render_Loop.
5. THE Horcrux_Tether SHALL use emissive HDR color values above 1 so that it glows under a bloom threshold of 1.0.
6. THE Horcrux_Tether SHALL follow the live positions of the three artifacts each frame.
7. WHEN the `'ring-seal'` Scene_Effect is dispatched while Horcrux_Mode is on, THE Scene SHALL pulse the Horcrux_Tethers once.

### Requirement 4: Bridge state without breaking layers

**User Story:** As a developer, I want Horcrux Mode state to reach the Scene without breaking layer boundaries, so that the architecture rules stay intact.

#### Acceptance Criteria

1. THE Scene_Bridge SHALL expose a setter and a getter for the Horcrux_Mode flag, holding a boolean and no secret data.
2. WHEN the user turns Horcrux_Mode on or off in the HUD, THE HUD SHALL write the new value to the Scene_Bridge.
3. THE Render_Loop SHALL read the Horcrux_Mode flag from the Scene_Bridge once per frame.
4. THE Scene SHALL pass no React state setter calls inside the Render_Loop.
5. THE Scene SHALL import no HUD, store, or crypto modules for the Horcrux_Mode flag or the Crimson_Glitch.
6. THE `sceneSignals` module SHALL remain the only HUD-to-loop signal module in `src/scene/sceneSignals.ts`, limited to its existing boolean, and the new flags SHALL travel through the Scene_Bridge.

### Requirement 5: Performance and data safety

**User Story:** As a user, I want the new effects to keep the scene smooth and the data safe, so that drama does not cost performance or security.

#### Acceptance Criteria

1. WHILE the Crimson_Glitch plays, THE Scene SHALL keep per-frame Scene work within the 4 ms Frame_Budget.
2. WHILE Horcrux_Tethers are visible, THE Scene SHALL keep per-frame Scene work within the 4 ms Frame_Budget.
3. WHEN the Scene is torn down, THE Scene SHALL dispose every geometry, material, and texture created for the Horcrux_Tethers and the Crimson_Glitch through the Scene_Registry.
4. WHEN the Scene mounts and unmounts repeatedly, THE Scene SHALL leave no listener registered on `onSceneEffect` from the new code.
5. THE Scene SHALL leave the Carrier_Pixels unmodified by the Crimson_Glitch and the Horcrux_Tethers.
6. THE Scene SHALL keep `THREE.NoColorSpace` on every carrier texture.
7. THE post-processing pipeline SHALL keep the bloom threshold at 1.0.
8. IF the adaptive quality monitor has disabled bloom, THEN THE Scene SHALL still render the Horcrux_Tethers and Crimson_Glitch without bloom.
9. THE Scene, HUD, and audio code added by this feature SHALL write no passphrase, key material, or plaintext to logs or the Scene_Bridge.

### Requirement 6: Verification and delivery

**User Story:** As a maintainer, I want the change verified and shipped safely, so that main stays green.

#### Acceptance Criteria

1. THE feature SHALL include automated tests for the glitch timing, the restart behavior, the tether visibility toggle, and the disposal of new resources.
2. WHEN `tsc`, `vitest --run`, and the production build all pass, THE maintainer workflow SHALL commit the feature changes and push them directly to the `main` branch.
3. IF any of `tsc`, `vitest --run`, or the production build fails, THEN THE maintainer workflow SHALL withhold the commit and push until the failure is fixed.

### Requirement 7: Custom vault shaders on the three artifacts

**User Story:** As a user, I want the Monolith, Cryptex Ring and Crystal to look charged and alive, so that the vault feels like a powerful object.

#### Acceptance Criteria

1. THE Scene SHALL render the Obsidian Monolith, each Cryptex Ring segment, and the Ethereal Crystal with a `THREE.ShaderMaterial` defined in `src/scene/artifacts/vaultShaders.ts`.
2. THE vault shaders SHALL provide a Fresnel rim term and procedural rune veining computed in the fragment shader, with no external texture.
3. THE vault shaders SHALL expose the uniforms `uTime`, `uEnergy`, `uDanger`, and `uXRayMode`, each a single shared value per scene updated once per frame.
4. WHILE the pipeline is active, THE Scene SHALL ease `uEnergy` toward 1, and WHILE it is idle, toward 0.
5. WHILE the X-Ray LSB Lens is on, THE Scene SHALL ease `uXRayMode` toward 1.
6. THE vault shaders SHALL output emissive HDR values above 1 for rune strokes and rim, so that they glow under a bloom threshold of 1.0.
7. THE artifacts SHALL keep their geometry, positions, hover and drag interactions, and Spatial Key output unchanged by the material change.

### Requirement 8: Data stream particles on encrypt and embed

**User Story:** As a user, I want a stream of particles while my file is being encrypted and embedded, so that I can see the work happening.

#### Acceptance Criteria

1. WHEN the encrypt pipeline leaves `idle`, `complete` or `error` for an active state, THE Scene SHALL start a `THREE.Points` spiral of cyan and violet particles in `src/scene/artifacts/DataStreamParticles.ts`.
2. WHEN the encrypt pipeline reaches `complete` or `error`, THE Scene SHALL fade the particles out within 600 ms and then hide them.
3. THE particle system SHALL use one preallocated geometry and material, with a fixed particle count and no per-frame allocation.
4. WHEN the stream starts, THE audio engine SHALL play a rising harmonic tone for the duration of the stream, and WHEN the stream ends it SHALL resolve and stop.
5. THE decrypt pipeline SHALL NOT start the particle stream.

### Requirement 9: Tripwire glitch details

**User Story:** As a user, I want the tripwire to shake the view and sound an alarm, so that the failure is unmistakable.

#### Acceptance Criteria

1. WHEN the Crimson_Glitch plays, THE Scene SHALL overlay a red scanline pulse and a crimson tint through the post-processing pipeline in `src/scene/postFx.ts`.
2. WHEN the Crimson_Glitch plays, THE Scene SHALL apply a damped camera shake that reaches zero offset at 1500 ms and leaves the OrbitControls target and orbit state unchanged afterwards.
3. WHEN the Crimson_Glitch plays, THE Scene SHALL set `uDanger` to 1 on all vault shaders, and SHALL return it to 0 at 1500 ms.
4. WHEN the Crimson_Glitch plays, THE audio engine SHALL play procedurally generated static and an alarm tone, with no audio files.
5. IF the AudioContext does not exist yet, is not `running`, or the user has muted audio, THEN THE audio engine SHALL play no tripwire or stream sound and SHALL raise no error.
6. WHERE the user agent reports `prefers-reduced-motion: reduce`, THE Scene SHALL skip the camera shake and keep the other glitch elements.

### Requirement 10: Audio mute control

**User Story:** As a user, I want to mute the vault audio, so that effects never play when I do not want them.

#### Acceptance Criteria

1. THE HUD SHALL provide a mute toggle that sets a muted flag on the audio engine.
2. WHILE audio is muted, THE audio engine SHALL output no sound from the ambient, ring click, shard, stream and tripwire sources.
3. WHEN the user unmutes, THE audio engine SHALL restore the previous master gain.
