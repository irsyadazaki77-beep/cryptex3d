# Requirements Document

## Introduction

Rencana 15 hari untuk membawa Cryptex3D (aplikasi brankas steganografi LSB 3D, enkripsi AES-256-GCM, P2P tanpa server signaling) ke kondisi siap submit Kiroween. Rencana dibagi menjadi enam fase berurutan: (1) deploy, CSP, QR, dan unduh carrier; (2) spec visual-drama; (3) Spatial Key dengan snap kisi, ekspor/impor, kombinasi brankas, dan mode dekoy; (4) STUN/TURN configurable dan uji lintas-browser; (5) guided tour, skenario tripwire Halloween, dan polish Judge Demo; (6) threat model, bukti tes, bukti Kiro, model audit lokal (stretch), freeze, README, screenshot, skrip video 3 menit, checklist submission, dan buffer.

Semua requirement tunduk pada steering `ui-theme`, `stego-security`, dan `architecture`. Fitur baru tidak boleh melonggarkan batas lapisan, primitif kripto Web Crypto, aturan carrier lossless, maupun larangan logging plaintext.

## Glossary

- **Cryptex3D**: Aplikasi web satu halaman (React 19, Three.js, Vite) yang menyembunyikan payload terenkripsi di piksel PNG.
- **Deploy_Pipeline**: Proses build Vite dan publikasi statis ke hosting publik yang dapat diakses juri.
- **CSP**: Content Security Policy yang dikirim pada situs terdeploy.
- **Carrier**: Gambar PNG RGBA 1024×1024 lossless yang membawa payload.
- **Carrier_Download**: Fitur unduh Carrier hasil embed sebagai berkas PNG tanpa re-encode lossy.
- **QR_Transfer**: Fitur pertukaran SDP offer/answer lewat kode QR.
- **Spatial_Key**: Kunci hasil serialisasi status rotasi artefak 3D, dipakai sebagai salah satu input salt PBKDF2.
- **Snap_Grid**: Kisi diskret sudut rotasi tempat rotasi artefak dibulatkan.
- **Spatial_Key_File**: Berkas ekspor Spatial_Key.
- **Vault_Combination**: Brankas yang menggabungkan lebih dari satu Spatial_Key atau lapisan payload pada satu Carrier.
- **Decoy_Mode**: Mode yang menanamkan payload umpan yang terbuka dengan Spatial_Key atau passphrase berbeda dari payload asli.
- **ICE_Config**: Konfigurasi server STUN/TURN untuk RTCPeerConnection.
- **P2P_Transport**: Modul `src/core/p2p/`.
- **Guided_Tour**: Tur langkah-demi-langkah interaktif di dalam HUD.
- **Tripwire_Scenario**: Skenario demo Halloween tempat Auditor mendeteksi carrier yang diubah dan memicu peringatan crimson.
- **Judge_Demo**: Mode demo lima langkah (Encrypt, Audit, P2P Sync, 3D Unlock, Decrypt).
- **Auditor**: Pipeline di `src/core/auditor/` yang berjalan di Web Worker.
- **Local_Audit_Model**: Model ML opsional yang dimuat lokal lewat `@huggingface/transformers` (stretch).
- **Visual_Drama_Spec**: Spec terpisah yang mendefinisikan peningkatan visual adegan 3D.
- **Threat_Model_Doc**: Dokumen threat model di repositori.
- **Evidence_Pack**: Kumpulan bukti hasil tes dan bukti penggunaan Kiro (spec, steering, hook).
- **Submission_Package**: README, screenshot, skrip video 3 menit, dan checklist submission.
- **Freeze**: Titik pembekuan kode; setelahnya hanya perbaikan bug kritis yang diizinkan.
- **Plan_Tracker**: Berkas rencana 15 hari di `.kiro/specs/kiroween-winning-plan/` yang memetakan hari ke fase dan deliverable.
- **Scene**: Lapisan Three.js di `src/scene/`.
- **Test_Suite**: Kumpulan tes Vitest dan fast-check proyek.

## Requirements

### Requirement 1: 15-Day Phased Plan

**User Story:** As a project owner, I want a 15-day plan with phased deliverables, so that every Kiroween deadline task has a scheduled day and an owner-verifiable outcome.

#### Acceptance Criteria

1. THE Plan_Tracker SHALL map each of the 15 days to exactly one of the six phases.
2. THE Plan_Tracker SHALL list for each phase at least one deliverable with a verifiable done-condition.
3. THE Plan_Tracker SHALL reserve at least 1 day of buffer after the Freeze and before submission.
4. WHEN a phase finishes, THE Plan_Tracker SHALL record the completion date and the verification result of each deliverable of that phase.
5. IF a phase deliverable is not complete by the last day of its phase, THEN THE Plan_Tracker SHALL record the deliverable as carried over and assign it to the buffer day or to an explicit descope decision.

### Requirement 2: Public Deploy with CSP

**User Story:** As a judge, I want to open a public URL that works immediately, so that I can evaluate Cryptex3D without installing anything.

#### Acceptance Criteria

1. WHEN the Deploy_Pipeline runs, THE Deploy_Pipeline SHALL publish the `dist` output to a public HTTPS URL.
2. THE Cryptex3D SHALL load and render the Scene on the deployed URL within 5 seconds on a broadband connection with a cold cache.
3. THE Deploy_Pipeline SHALL deliver a CSP header that blocks inline scripts, `eval`, and external script origins.
4. THE Deploy_Pipeline SHALL serve bundled fonts and assets without `data:` URIs.
5. IF the deployed site emits a CSP violation during the Judge_Demo flow, THEN THE Deploy_Pipeline SHALL be corrected until the Judge_Demo flow emits zero CSP violations.
6. THE Cryptex3D SHALL keep the initial JavaScript bundle below 150 KiB (153 600 bytes) gzip, with `scene`, `crypto`, `stego`, `auditor`, `p2p`, and `audio` loaded as dynamic import chunks.

### Requirement 3: QR SDP Transfer

**User Story:** As a user, I want to transfer SDP by QR code on the deployed site, so that two devices can pair without a signaling server.

#### Acceptance Criteria

1. WHEN a user requests a QR code for an SDP offer or answer, THE QR_Transfer SHALL render a QR code that encodes the full SDP string.
2. WHEN the SDP string exceeds the capacity of a single QR code, THE QR_Transfer SHALL split the SDP into numbered QR frames and display them in sequence.
3. WHEN a user scans or pastes all frames, THE QR_Transfer SHALL reassemble the SDP and deliver the identical string to the P2P_Transport.
4. IF a frame is missing or corrupt, THEN THE QR_Transfer SHALL display the index of the missing frame.
5. THE QR_Transfer SHALL keep copy-paste of the SDP available as an alternative on the same panel.
6. THE QR_Transfer SHALL operate under the deployed CSP without violations.

### Requirement 4: Carrier Download

**User Story:** As a user, I want to download the carrier PNG after embedding, so that I can store or share it outside the app.

#### Acceptance Criteria

1. WHEN embedding completes, THE Carrier_Download SHALL offer a download action for the resulting PNG.
2. THE Carrier_Download SHALL write the downloaded PNG byte-for-byte from the `Uint8ClampedArray` pixel data of the embedded Carrier, encoded losslessly at 1024×1024 RGBA.
3. WHEN a user loads a downloaded Carrier into the decrypt flow, THE Cryptex3D SHALL extract a payload identical to the embedded payload.
4. IF no embedded Carrier exists, THEN THE Carrier_Download SHALL disable the download action and show an explanatory label.
5. THE Carrier_Download SHALL name the file with a non-sensitive name that excludes passphrase and payload content.

### Requirement 5: Visual Drama Spec

**User Story:** As a project owner, I want a dedicated visual-drama spec, so that visual upgrades are planned and testable without breaking steering constraints.

#### Acceptance Criteria

1. THE Visual_Drama_Spec SHALL exist as its own spec directory with requirements, design, and tasks documents.
2. THE Visual_Drama_Spec SHALL define each visual effect with a frame-time budget not exceeding 4 ms per frame on the main thread.
3. THE Visual_Drama_Spec SHALL restrict glow animations to `opacity` and `filter: blur()` properties for HUD elements.
4. WHILE the adaptive quality monitor has disabled bloom, THE Scene SHALL continue to render all visual effects that do not require bloom.
5. WHEN a visual effect is added, THE Scene SHALL dispose every geometry, material, texture, and render target of that effect on teardown.
6. THE Visual_Drama_Spec SHALL keep carrier textures with `NoColorSpace`, `NearestFilter`, and `generateMipmaps = false`.

### Requirement 6: Spatial Key Grid Snap

**User Story:** As a user, I want the Spatial Key to snap to a grid, so that I can reproduce the same key reliably by hand.

#### Acceptance Criteria

1. WHEN the user releases an artifact rotation, THE Spatial_Key SHALL round each rotation angle to the nearest Snap_Grid step.
2. THE Spatial_Key SHALL serialize deterministically, so that identical snapped rotations always produce identical serialized bytes.
3. WHILE the user drags an artifact, THE Scene SHALL display the nearest Snap_Grid position as a visual guide.
4. WHEN a different Snap_Grid step is selected, THE Spatial_Key SHALL re-snap the current rotations to the new step.
5. THE Spatial_Key SHALL contribute to the PBKDF2 salt together with the passphrase, so that a wrong Spatial_Key yields an authenticated decryption failure.
6. THE Scene SHALL emit the Spatial_Key to the UI only as a serialized value that excludes the passphrase and derived key material.

### Requirement 7: Spatial Key Export and Import

**User Story:** As a user, I want to export and import the Spatial Key, so that I can back it up and restore it on another device.

#### Acceptance Criteria

1. WHEN the user requests export, THE Cryptex3D SHALL produce a Spatial_Key_File containing the snapped rotation values, a format version, and the Snap_Grid step.
2. THE Spatial_Key_File SHALL exclude the passphrase, plaintext, and derived key material.
3. WHEN the user imports a valid Spatial_Key_File, THE Scene SHALL set the artifact rotations to the imported values.
4. FOR ALL valid Spatial_Key values, export followed by import SHALL produce a Spatial_Key equal to the original (round-trip property).
5. IF an imported file has an unknown version, malformed structure, or values outside the Snap_Grid, THEN THE Cryptex3D SHALL reject the file and show a user-visible error with an error code.

### Requirement 8: Vault Combination

**User Story:** As a user, I want to combine multiple keys into one vault, so that opening a vault requires several independent factors.

#### Acceptance Criteria

1. WHERE Vault_Combination is enabled, THE Cryptex3D SHALL derive the encryption key from the passphrase and all selected Spatial_Key values in a fixed, documented order.
2. WHERE Vault_Combination is enabled, THE Cryptex3D SHALL fail decryption with an authentication error when any one Spatial_Key is missing or wrong.
3. WHERE Vault_Combination is enabled, THE Cryptex3D SHALL generate a fresh 12-byte IV and a fresh salt of at least 16 bytes per encrypt call.
4. THE Cryptex3D SHALL use PBKDF2-SHA-256 with at least 310 000 iterations for every Vault_Combination key derivation.
5. WHEN a user embeds a Vault_Combination payload, THE Cryptex3D SHALL keep the bitstream format of magic header, length, ciphertext, and SHA-256 checksum unchanged.
6. IF the ciphertext exceeds 256 000 bytes, THEN THE Cryptex3D SHALL throw a typed error before modifying any pixel.

### Requirement 9: Decoy Mode

**User Story:** As a user under duress, I want a decoy payload, so that I can reveal a harmless secret without exposing the real one.

#### Acceptance Criteria

1. WHERE Decoy_Mode is enabled, THE Cryptex3D SHALL embed a decoy ciphertext and a real ciphertext in the same Carrier, each protected by its own credentials.
2. WHEN the decoy credentials are supplied, THE Cryptex3D SHALL decrypt and return only the decoy payload.
3. WHEN the real credentials are supplied, THE Cryptex3D SHALL decrypt and return only the real payload.
4. IF neither set of credentials is correct, THEN THE Cryptex3D SHALL return one error that does not reveal whether a decoy exists.
5. THE Cryptex3D SHALL make the combined decoy and real payload fit within the 256 000-byte ciphertext limit and reject larger input with a typed error before modifying pixels.
6. THE Cryptex3D SHALL embed the decoy and real ciphertexts as one container inside a single bitstream covered by the magic header, length, and SHA-256 checksum, so that any bit change in the container is detected before decryption.

### Requirement 10: Configurable STUN and TURN

**User Story:** As a user behind NAT, I want configurable STUN/TURN servers, so that P2P connects on restrictive networks.

#### Acceptance Criteria

1. THE P2P_Transport SHALL accept an ICE_Config containing one or more STUN or TURN server entries.
2. WHEN the user saves an ICE_Config, THE Cryptex3D SHALL persist the ICE_Config in browser local storage and apply it to the next connection.
3. IF a TURN entry contains credentials, THEN THE Cryptex3D SHALL keep the credentials out of logs, error messages, and the SDP display.
4. IF an ICE_Config entry has an invalid URL scheme, THEN THE Cryptex3D SHALL reject the entry and show a user-visible error naming the field.
5. WHERE no ICE_Config is saved, THE P2P_Transport SHALL use a default public STUN entry listed in documentation.
6. WHEN RTCPeerConnection is unavailable or has not connected, THE P2P_Transport SHALL activate the BroadcastChannel fallback automatically.
7. THE P2P_Transport SHALL transfer raw byte arrays without performing crypto or stego operations.

### Requirement 11: Cross-Browser Support

**User Story:** As a judge using any mainstream browser, I want Cryptex3D to work in Chrome, Firefox, Edge, and Safari, so that evaluation does not depend on my browser choice.

#### Acceptance Criteria

1. THE Test_Suite SHALL include a documented cross-browser checklist covering encrypt, embed, download, extract, decrypt, and P2P in the latest stable Chrome, Firefox, Edge, and Safari.
2. WHEN a browser lacks a required API, THE Cryptex3D SHALL show a user-visible message naming the missing capability.
3. IF WebGLRenderer creation fails, THEN THE Scene SHALL render the WebGL fallback canvas with an error message.
4. WHEN WebGL context loss occurs, THE Scene SHALL pause the render loop, wait 4 seconds for restoration, and then remount the canvas or show the fallback.
5. THE Plan_Tracker SHALL record the result and any known issue for each browser in the checklist.

### Requirement 12: Guided Tour

**User Story:** As a first-time judge, I want a guided tour, so that I understand what Cryptex3D does within the first minute.

#### Acceptance Criteria

1. WHEN a user starts the Guided_Tour, THE Guided_Tour SHALL present ordered steps that highlight the Command Dock, Spatial Key readout, Zen toggle, and Judge_Demo control.
2. WHILE the Guided_Tour is active, THE Guided_Tour SHALL allow the user to go back, advance, and skip at every step.
3. THE Guided_Tour SHALL occlude no more than 40% of the canvas.
4. THE Guided_Tour SHALL use precise functional text and Lucide React icons, and keep the dark glassmorphic styling.
5. WHEN the user finishes or skips the Guided_Tour, THE Cryptex3D SHALL store the completion flag in local storage and not auto-start the Guided_Tour again.

### Requirement 13: Halloween Tripwire Scenario

**User Story:** As a judge, I want a Halloween tripwire scenario, so that I see the Auditor detect tampering in a dramatic but clear way.

#### Acceptance Criteria

1. WHEN the user starts the Tripwire_Scenario, THE Cryptex3D SHALL embed a payload, alter a defined fraction of LSBs in the Carrier, and run the Auditor on the altered Carrier.
2. WHEN the Auditor flags the altered Carrier, THE Cryptex3D SHALL display the crimson audit alert with the Chi-Square and Shannon entropy values computed on the LSB plane.
3. WHEN extraction runs on the altered Carrier, THE Cryptex3D SHALL surface a user-visible checksum mismatch error.
4. THE Auditor SHALL run in a Web Worker and only advise, without blocking the embed or extract pipeline.
5. THE Tripwire_Scenario SHALL use no external API calls.
6. THE Tripwire_Scenario SHALL use only precise, functional micro-copy.

### Requirement 14: Judge Demo Polish

**User Story:** As a judge, I want a polished Judge Demo, so that the five-step flow runs reliably end to end.

#### Acceptance Criteria

1. WHEN the user starts Judge_Demo, THE Judge_Demo SHALL execute Encrypt, Audit, P2P Sync, 3D Unlock, and Decrypt in that order.
2. WHILE Judge_Demo runs, THE Judge_Demo SHALL show the current step in the stepper and mark finished steps.
3. WHEN all five steps finish, THE Judge_Demo SHALL display a result in which the decrypted payload equals the original payload.
4. IF a step fails, THEN THE Judge_Demo SHALL stop, mark the failed step, and show a sanitized error that contains no plaintext, passphrase, or key material.
5. THE Judge_Demo SHALL complete the full flow within 60 seconds on a mid-range laptop in the latest stable Chrome.
6. WHEN the user cancels Judge_Demo, THE Judge_Demo SHALL release workers, channels, and timers.

### Requirement 15: Threat Model

**User Story:** As a security reviewer, I want a threat model, so that I can see what Cryptex3D protects and what it does not.

#### Acceptance Criteria

1. THE Threat_Model_Doc SHALL list assets, adversaries, trust boundaries, and attack surfaces for encrypt, embed, extract, P2P, and Auditor.
2. THE Threat_Model_Doc SHALL state each in-scope threat with its mitigation and the file or test that implements the mitigation.
3. THE Threat_Model_Doc SHALL state explicit limitations, including that steganography does not hide the existence of data from a statistical adversary.
4. THE Threat_Model_Doc SHALL document the PBKDF2 iteration count, the AES-256-GCM parameters, and the salt composition.
5. THE Threat_Model_Doc SHALL describe Decoy_Mode and Vault_Combination limits without claiming deniability beyond what the implementation provides.

### Requirement 16: Test and Kiro Evidence

**User Story:** As a judge, I want verifiable evidence of quality and of Kiro usage, so that I can trust the claims in the submission.

#### Acceptance Criteria

1. THE Evidence_Pack SHALL include the output of a full Test_Suite run with passing counts and the run date.
2. THE Test_Suite SHALL include property-based tests for the Spatial_Key export/import round trip, encrypt/decrypt round trip, embed/extract round trip, and wrong-key decryption failure.
3. THE Evidence_Pack SHALL document the Kiro specs, steering files, and hooks used, each with a link to its file path.
4. THE Evidence_Pack SHALL map each Kiro artifact to the feature or defect it produced.
5. WHEN a claim in README or video script cites a test or metric, THE Evidence_Pack SHALL contain the matching result.
6. THE Test_Suite SHALL verify that no console output in the crypto, stego, and auditor paths contains plaintext, passphrase, or key material.

### Requirement 17: Local Audit Model (Stretch)

**User Story:** As a project owner, I want an optional local audit model, so that the Auditor offers an ML-based second opinion without leaving the browser.

#### Acceptance Criteria

1. WHERE Local_Audit_Model is enabled, THE Auditor SHALL load the model locally inside the Web Worker with no external API call.
2. WHERE Local_Audit_Model is enabled, THE Auditor SHALL add the model score to the report as an advisory value next to the heuristic score.
3. IF the Local_Audit_Model fails to load, THEN THE Auditor SHALL return the heuristic report and show a notice that the model is unavailable.
4. THE Plan_Tracker SHALL mark Local_Audit_Model as stretch and allow descoping without affecting any other deliverable.
5. THE Local_Audit_Model SHALL stay out of the initial bundle and load only on user request.

### Requirement 18: Freeze and Submission Package

**User Story:** As a project owner, I want a code freeze and a complete submission package, so that submission happens on time with no last-minute changes.

#### Acceptance Criteria

1. WHEN the Freeze day starts, THE Plan_Tracker SHALL record the freeze commit hash.
2. WHILE the Freeze is in effect, THE Plan_Tracker SHALL permit only fixes for defects that break the Judge_Demo flow or the build.
3. THE Submission_Package SHALL include a README with the project description, live URL, setup commands, architecture overview, security model summary, and Kiro usage summary.
4. THE Submission_Package SHALL include at least 5 screenshots showing the Command Dock, the 3D scene, the audit alert, the P2P panel, and the Judge_Demo stepper.
5. THE Submission_Package SHALL include a video script of no more than 3 minutes, with timed segments that cover problem, demo, security, and Kiro usage.
6. THE Submission_Package SHALL include a submission checklist covering URL reachability, repository visibility, open-source license, video link, and category fields.
7. WHEN the final build runs, THE Cryptex3D SHALL pass `tsc --noEmit`, the production build, and the full Test_Suite with zero failures.
8. THE Plan_Tracker SHALL keep at least 1 buffer day with no planned feature work before the submission deadline.

### Requirement 19: Steering Compliance

**User Story:** As a maintainer, I want every new feature to respect the existing steering, so that the new work does not regress security, architecture, or style.

#### Acceptance Criteria

1. THE Cryptex3D SHALL use only the Web Crypto API for cryptographic operations and no third-party crypto library.
2. THE Cryptex3D SHALL keep passphrase and derived key material out of `src/scene/` and `src/components/`.
3. THE Cryptex3D SHALL run crypto, stego, and auditor work in dedicated Web Workers that exchange typed message envelopes.
4. THE Cryptex3D SHALL render all new HUD elements in dark mode only, with flat-colour buttons, `rounded-lg`, Lucide React icons, and the bundled Inter Variable and JetBrains Mono fonts.
5. THE Cryptex3D SHALL render payload text, hex values, checksums, SDP strings, and error codes in JetBrains Mono.
6. IF any new feature requires an import across a forbidden layer boundary, THEN THE Cryptex3D SHALL route the interaction through props, callbacks, Zustand selectors, or `postMessage`.
