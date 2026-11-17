# Requirements Document

## Introduction

Cryptex3D is a zero-knowledge, 100% browser-native encrypted dead-drop disguised as an interactive 3D atmospheric vault. Users encrypt arbitrary payloads (up to 250 KB) into lossless PNG carrier textures, transfer them peer-to-peer via WebRTC DataChannels or a multi-tab BroadcastChannel fallback, and decrypt them by recreating the exact 3D artifact state used during encryption. The system has no backend, no server, and no account. It is built for the Kiroween 2026 Hackathon (Frankenstein category) and is hosted at `zaki5544/cryptex3d` on GitHub under the MIT license.

## Glossary

- **Application**: The Cryptex3D single-page application running entirely in the browser.
- **Artifact**: One of the three interactive 3D objects in the vault — Obsidian Monolith, Cryptex Ring, or Ethereal Crystal.
- **AuditPanel**: The React HUD panel that displays the entropy audit report to the user.
- **AuditReport**: The structured output of the Auditor Worker containing a detectability score, warnings, and a recommendation.
- **AuditorWorker**: The Web Worker that performs chi-square, Shannon entropy, and LSB-pair analysis on a carrier PNG.
- **AudioEngine**: The browser-side Web Audio API module that manages ambient and tactile audio.
- **BitstreamLayout**: The binary format written into PNG LSBs: magic header + payload length + ciphertext + SHA-256 checksum.
- **BroadcastChannelFallback**: The same-origin multi-tab transport that substitutes for WebRTC when unavailable.
- **Carrier**: A 1024×1024 RGBA PNG texture used as the steganographic container.
- **CryptoWorker**: The Web Worker that performs AES-256-GCM encryption and decryption and PBKDF2 key derivation.
- **DataChannelHandler**: The component that chunks and reassembles large Uint8Array transfers over a WebRTC DataChannel.
- **DecryptPanel**: The React HUD panel for passphrase entry and decrypted file download.
- **DemoModeOrchestrator**: The component that executes the full pipeline in under 60 seconds with a pre-set demo payload for judges.
- **EncryptPanel**: The React HUD panel for file drop and passphrase entry during encryption.
- **LSBEmbedder**: The component that writes payload bytes into the least-significant bits of R, G, and B channels of the carrier PNG.
- **LSBExtractor**: The component that reads and validates payload bytes from the LSBs of a received carrier PNG.
- **P2PManager**: The component that owns the RTCPeerConnection lifecycle and DataChannel transfer.
- **P2PPanel**: The React HUD panel for SDP offer/answer exchange, QR display, and transfer progress.
- **Payload**: The plaintext file bytes the user wishes to encrypt and transfer, up to 250 KB (256 000 bytes).
- **Pipeline**: The ordered sequence: encrypt → embed → audit → transfer → extract → decrypt.
- **PBKDF2**: Password-Based Key Derivation Function 2 using HMAC-SHA-256 at 310 000 iterations.
- **SpatialKeyDisplay**: The read-only HUD panel showing the current serialized hash of the artifact rotation state.
- **SpatialKeySerializer**: The pure serializer that converts artifact rotation state into a SpatialKeySnapshot and stores it in the Vault Store.
- **SpatialKeySnapshot**: The structured record of all artifact rotation states: monolith XYZ rotation, ring segment positions, crystal activation flag, and their SHA-256 hash.
- **StegoWorker**: The Web Worker that performs LSB embedding and extraction.
- **VaultStore**: The Zustand global state store shared across all React components and Workers.
- **WebGLFallback**: The error panel rendered when WebGL is unavailable.

---

## Requirements

### Requirement 1: Three.js 3D Vault Rendering

**User Story:** As a user, I want to interact with a 3D atmospheric vault containing three distinct artifacts, so that I can set a unique visual combination that acts as part of my encryption key.

#### Acceptance Criteria

1. WHEN the Application loads, THE Application SHALL render a Three.js scene containing the Obsidian Monolith, the Cryptex Ring, and the Ethereal Crystal at a sustained rate of at least 60 frames per second, measured over any continuous 1-second window.
2. WHEN the user drags the Obsidian Monolith, THE Application SHALL update the monolith's rotation on each pointer-move event and emit the new rotation as three floating-point values representing the X, Y, and Z Euler angles, each in the range [0, 2π) radians.
3. WHEN the user clicks a Cryptex Ring segment, THE Application SHALL advance that segment through 10 discrete positions (0–9) cyclically and emit the updated position array for all 8 segments of the Cryptex Ring.
4. WHEN the user hovers over the Ethereal Crystal, THE Application SHALL begin a glow animation lasting 300 milliseconds and set `crystalActivated` to `true` in the VaultStore; WHEN the hover ends, THE Application SHALL reverse the glow animation over 300 milliseconds and set `crystalActivated` to `false` in the VaultStore.
5. WHILE no Artifact interaction (drag on Monolith, click on Cryptex Ring segment, or hover on Ethereal Crystal) is in progress, THE Application SHALL enable orbit navigation via OrbitControls; WHILE any Artifact interaction is in progress, THE Application SHALL disable OrbitControls.
6. WHEN the Application unmounts or the browser tab closes, THE Application SHALL dispose all Three.js geometry, materials, textures, and the WebGLRenderer associated with the vault scene.
7. IF `WebGLRenderer` construction fails or `canvas.getContext("webgl2")` returns null, THEN THE Application SHALL render the WebGLFallback panel and SHALL accept a manually entered hex string of exactly 64 hexadecimal characters as a substitute Spatial Key; IF the entered string does not contain exactly 64 hexadecimal characters, THEN THE Application SHALL display an error indicating the input is invalid and SHALL NOT proceed with key derivation.

---

### Requirement 2: Spatial Key Serialization

**User Story:** As a user, I want my exact artifact configuration to be captured as a deterministic cryptographic input, so that only someone who knows the same configuration can decrypt my message.

#### Acceptance Criteria

1. WHEN any Artifact state changes, THE SpatialKeySerializer SHALL write a SpatialKeySnapshot containing monolith rotation X, Y, Z as floating-point values in degrees within the range [0.0, 360.0), all ring segment positions as integer indices, and the crystal activation flag as a boolean to the VaultStore within 100 milliseconds of the state change event.
2. THE SpatialKeySerializer SHALL compute a SHA-256 hash over all SpatialKeySnapshot fields serialized in a fixed, deterministic field order and store the resulting 64-character hexadecimal string as `serializedHash` within the same SpatialKeySnapshot.
3. FOR ALL pairs of SpatialKeySnapshots where any single field differs by more than floating-point epsilon (1e-9 for rotation values, exact equality for integer and boolean fields), THE SpatialKeySerializer SHALL produce different `serializedHash` values.
4. THE SpatialKeySerializer SHALL contain no Three.js imports and SHALL communicate with the scene only through event emitters.
5. IF the Artifact state change event carries incomplete or malformed field data (any required field absent or outside its valid range), THEN THE SpatialKeySerializer SHALL discard the snapshot, emit an error event indicating which field failed validation, and SHALL NOT update the VaultStore.

---

### Requirement 3: AES-256-GCM Encryption and Decryption

**User Story:** As a user, I want my payload encrypted with strong authenticated encryption derived from both my passphrase and my 3D artifact configuration, so that neither the passphrase alone nor the artifact state alone is sufficient to decrypt.

#### Acceptance Criteria

1. WHEN the user submits a Payload and a passphrase of 8 to 64 characters for encryption, THE CryptoWorker SHALL derive a 256-bit AES-GCM key using PBKDF2-HMAC-SHA-256 at 310,000 iterations with a 16-byte salt computed as the first 16 bytes of SHA-256(passphrase + spatialKeyHash).
2. IF the submitted passphrase is fewer than 8 characters or more than 64 characters, THEN THE CryptoWorker SHALL post `{ error: "INVALID_PASSPHRASE" }` to the VaultStore and SHALL NOT proceed with key derivation or encryption.
3. WHEN key derivation completes, THE CryptoWorker SHALL encrypt the Payload using AES-256-GCM with a 12-byte IV generated by `crypto.getRandomValues`, producing ciphertext and a 16-byte authentication tag, then SHALL post `{ iv, salt, ciphertext, tag }` as a single bundle to the VaultStore, where `iv` is 12 bytes, `salt` is 16 bytes, `ciphertext` is the encrypted Payload bytes, and `tag` is 16 bytes.
4. THE CryptoWorker SHALL create all CryptoKey objects with `extractable: false` so that key material never leaves the Worker.
5. WHEN the user submits a passphrase and a SpatialKeySnapshot for decryption, THE CryptoWorker SHALL reconstruct the AES-GCM key from the `salt` field of the stored bundle and the current spatialKeyHash, and IF decryption succeeds, SHALL post `{ plaintext }` containing the recovered byte sequence to the VaultStore.
6. THE CryptoWorker SHALL guarantee that for any Payload of 1 to 256,000 bytes, any passphrase of 8 to 64 characters, and any SpatialKeySnapshot, decrypting the ciphertext produced by encrypting that Payload with that passphrase and SpatialKeySnapshot using the same passphrase and SpatialKeySnapshot returns a byte sequence identical to the original Payload.
7. IF a SpatialKeySnapshot submitted for decryption differs in any field from the SpatialKeySnapshot used at encryption time, THEN THE CryptoWorker SHALL fail authentication and SHALL NOT return any partial or complete plaintext.
8. IF decryption fails due to an AES-GCM authentication tag mismatch, THEN THE CryptoWorker SHALL post `{ error: "AUTH_FAIL" }` to the VaultStore.

---

### Requirement 4: LSB Steganography Embed and Extract

**User Story:** As a user, I want my encrypted payload hidden inside a lossless PNG so that the carrier file appears visually indistinguishable from an ordinary image.

#### Acceptance Criteria

1. WHEN the StegoWorker receives an embed command, THE LSBEmbedder SHALL write the BitstreamLayout — magic header (8 bytes: `0x43 52 59 50 54 33 44 00`), big-endian uint32 payload length, ciphertext bytes, and a SHA-256 checksum over header + length + ciphertext — into the least-significant bits of the R, G, and B channels of the Carrier pixel buffer.
2. FOR ALL ciphertext byte sequences of length 1 to 256 000 bytes, extracting from a Carrier that was embedded with that sequence SHALL return a byte sequence equal to the original ciphertext (LSB round-trip).
3. WHEN embedding completes, the Carrier pixel buffer SHALL differ from the pre-embed buffer only in the least-significant bit of each R, G, and B channel byte whose bit slot was consumed by the BitstreamLayout; all other bits in R, G, B, and all bits in the A channel SHALL remain unchanged.
4. WHEN the StegoWorker receives an extract command, THE LSBExtractor SHALL verify the magic header; IF the header bytes do not exactly match `0x43 52 59 50 54 33 44 00`, THEN THE LSBExtractor SHALL post `{ error: "BAD_MAGIC" }` to the main thread without returning any bytes.
5. WHEN the magic header is valid, THE LSBExtractor SHALL verify the SHA-256 checksum over the extracted bitstream; IF the checksum does not match, THEN THE LSBExtractor SHALL post `{ error: "CHECKSUM_FAIL" }` to the main thread without returning any bytes.
6. IF a Payload exceeds 256 000 bytes, THEN THE LSBEmbedder SHALL throw `PayloadTooLargeError` before writing any pixel data.
7. WHEN the user clicks the download button after embedding completes, THE Application SHALL produce the output file using `canvas.toBlob(..., 'image/png')` with no quality argument to guarantee lossless PNG encoding.

---

### Requirement 5: Entropy Audit

**User Story:** As a user, I want an advisory detectability score for my stego carrier so that I can judge whether the hidden payload is likely to be detected by statistical analysis.

#### Acceptance Criteria

1. WHEN the embed pipeline completes, THE AuditorWorker SHALL run a chi-square test, Shannon entropy calculation, and LSB-pair anomaly analysis on the Carrier LSB plane entirely off the main thread.
2. WHEN analysis completes, THE AuditorWorker SHALL post an AuditReport containing a score from 0 (statistically indistinguishable from a natural image) to 100 (high statistical anomaly indicating likely steganographic content), a string array of human-readable warnings of at most 10 entries each no longer than 200 characters, and a recommendation string no longer than 500 characters.
3. WHEN the user has not opted into "Advanced Audit", THE AuditorWorker SHALL compute the score using pure-JavaScript weighted heuristics without loading `@huggingface/transformers`.
4. WHERE the user opts into "Advanced Audit", THE AuditorWorker SHALL load the `@huggingface/transformers` heuristic model lazily and incorporate its output into the score, keeping the final score within the 0–100 range.
5. WHEN the AuditPanel is visible and an AuditReport is available, THE Application SHALL display the score, all warnings, and the recommendation from the most recent AuditReport.
6. IF the AuditPanel is visible and no AuditReport has been generated yet, THEN THE Application SHALL display a placeholder indicating that no audit has been run.
7. IF the AuditorWorker encounters an error during analysis, THEN THE AuditorWorker SHALL post `{ error: "AUDIT_FAIL" }` to the main thread and THE Application SHALL display an error message indicating that the audit could not be completed.

---

### Requirement 6: WebRTC P2P Transfer

**User Story:** As a sender, I want to transfer the stego carrier directly to the recipient without any server, so that no third party ever handles the encrypted data.

#### Acceptance Criteria

1. WHEN the user opens the P2PPanel, IF WebRTC is available, THEN THE P2PManager SHALL create an RTCPeerConnection and produce an SDP offer displayed as copyable monospace text and as a scannable QR code.
2. WHEN the recipient pastes an SDP answer, THE P2PManager SHALL complete ICE negotiation and open a DataChannel.
3. WHEN a DataChannel is open, THE DataChannelHandler SHALL transfer the Carrier as 16 KB chunks with backpressure, and SHALL report transfer completion once all chunks have been acknowledged by the receiver.
4. WHEN transfer is in progress, THE P2PPanel SHALL display a progress indicator updated from TransferProgressTracker byte-count events.
5. IF ICE gathering takes more than 30 seconds without a connected candidate pair, THEN THE P2PManager SHALL emit a timeout event and THE P2PPanel SHALL offer "Switch to Same-Device Mode".
6. IF WebRTC negotiation fails mid-session, THEN THE Application SHALL automatically activate the BroadcastChannelFallback without requiring the user to restart the pipeline.

---

### Requirement 7: Multi-Tab BroadcastChannel Fallback

**User Story:** As a user testing on a single device, I want to transfer a carrier between two browser tabs on the same origin so that judges can verify the full pipeline without a second device.

#### Acceptance Criteria

1. IF `RTCPeerConnection` is unavailable, THEN THE Application SHALL open `BroadcastChannel("cryptex3d-p2p")` and begin listening for carrier messages.
2. WHEN the user selects "Same-Device Mode", THE Application SHALL open `BroadcastChannel("cryptex3d-p2p")` and begin listening for carrier messages.
3. WHEN the sender tab posts a Carrier over `BroadcastChannel("cryptex3d-p2p")`, THE receiving tab SHALL receive a byte sequence identical in length and content to the posted Carrier.
4. WHILE the BroadcastChannel is open, THE Application SHALL remain ready to receive additional transfers without requiring a page reload.

---

### Requirement 8: Web Audio Engine

**User Story:** As a user, I want procedural ambient audio and tactile sound feedback so that the vault interaction feels atmospheric and immersive.

#### Acceptance Criteria

1. WHEN the first user interaction event occurs after page load, THE AudioEngine SHALL resume the AudioContext so that `AudioContext.state` becomes `"running"`.
2. WHILE the Application is active, THE AmbientSynthesizer SHALL generate a continuous procedural soundscape using oscillators and convolution reverb.
3. WHEN the camera position changes in the Three.js scene, THE SpatialMixer SHALL adjust panning and attenuation of ambient sources to match the camera position.
4. WHEN a Cryptex Ring segment is rotated, THE TactileSFX SHALL play a synthesized click sound with a pitch selected from 10 discrete values mapped monotonically to segment indices 0 through 9, where index 0 produces the lowest pitch and index 9 produces the highest.
5. IF `AudioContext` creation fails, THEN THE AudioEngine SHALL suppress all audio output silently and SHALL NOT display an error to the user.

---

### Requirement 9: React HUD Panels

**User Story:** As a user, I want glassmorphic overlay panels for every interaction step so that the full pipeline is accessible without leaving the 3D environment.

#### Acceptance Criteria

1. WHEN the user confirms the encrypt action, THE EncryptPanel SHALL accept a file of up to 256 000 bytes via drag-and-drop or file picker and a passphrase of 8 to 64 characters, and SHALL dispatch the encrypt-and-embed action to the VaultStore.
2. IF the user-selected file exceeds 256 000 bytes, THEN THE EncryptPanel SHALL display an error indicating the file is too large and SHALL NOT dispatch the encrypt-and-embed action.
3. WHEN the user confirms the decrypt action, THE DecryptPanel SHALL accept a passphrase input of 8 to 64 characters and SHALL dispatch the extract-and-decrypt action to the VaultStore; once the VaultStore reports decryption success, THE DecryptPanel SHALL present a download prompt for the decrypted file.
4. WHEN a PipelineStatus state transitions to `deriving`, `encrypting`, `embedding`, `auditing`, `transferring`, `extracting`, or `decrypting`, THE Application SHALL display a progress indicator whose label text matches the active state name exactly.
5. THE SpatialKeyDisplay SHALL show the full 64-character hexadecimal `serializedHash` from the current VaultStore SpatialKeySnapshot in a read-only panel updated within one render cycle of each snapshot change.
6. WHEN an operation fails, THE Application SHALL display a user-readable error message derived from `VaultStore.lastError` that contains no passphrase substring, no AES key bytes, no IV bytes, and no stack trace text.

---

### Requirement 10: Judge Demo Mode

**User Story:** As a hackathon judge, I want a one-click demo that runs the full pipeline in under 60 seconds with a pre-set payload so that I can verify correctness without manually configuring artifacts.

#### Acceptance Criteria

1. WHEN the user clicks the "Judge Demo Mode" button, THE DemoModeOrchestrator SHALL execute the complete Pipeline — encrypt, embed, audit, BroadcastChannel transfer, extract, and decrypt — using a pre-set demo payload of exactly 1 024 bytes within 60 seconds of the button click.
2. WHEN Demo Mode completes, THE Application SHALL display the decrypted payload as a hexadecimal string and SHALL display a confirmation message indicating whether the decrypted bytes match the original demo payload byte-for-byte.
3. WHEN Demo Mode is running, THE Application SHALL display a stage label identifying the current pipeline step — `encrypting`, `embedding`, `auditing`, `transferring`, `extracting`, or `decrypting` — updated within 500 ms of each stage transition so that judges can follow the execution sequence.
4. IF the Demo Mode pipeline does not complete within 60 seconds, THEN THE DemoModeOrchestrator SHALL abort all in-progress operations and THE Application SHALL display an error indicating that the demo timed out.

---

### Requirement 11: Web Worker Isolation and Main-Thread Safety

**User Story:** As a user, I want the 3D scene to remain smooth during encryption and analysis so that heavy computation never causes visible stutter or dropped frames.

#### Acceptance Criteria

1. THE CryptoWorker, StegoWorker, and AuditorWorker SHALL each run as dedicated long-lived Web Workers; no crypto, stego, or audit computation SHALL execute synchronously on the main thread.
2. WHEN a Worker has received no message for 30 consecutive seconds, THE Application SHALL terminate that Worker and SHALL restart it on the next incoming message.
3. WHILE any Worker operation is in progress, THE Three.js render loop frame time SHALL remain at or below 4 ms on the main thread.
4. WHEN the Application loads, THE Application SHALL defer loading of Three.js, Tailwind, and all Worker modules as dynamic import chunks; the initial JS bundle delivered to the browser SHALL NOT exceed 150 KB gzipped.

---

### Requirement 12: No Plaintext Leakage

**User Story:** As a security-conscious user, I want assurance that my decrypted payload, passphrase, and key material are never exposed outside the cryptographic pipeline so that the system maintains zero-knowledge guarantees.

#### Acceptance Criteria

1. THE Application SHALL never write decrypted payload bytes, raw passphrase strings, or derived AES-GCM key material to any `console.log` call.
2. THE Application SHALL never include decrypted payload bytes, raw passphrase strings, or derived key material in any error message surfaced to the HUD.
3. THE Application SHALL never transmit decrypted payload bytes, raw passphrase strings, or derived key material in any outbound network request.
4. THE Application SHALL enforce `Content-Security-Policy: default-src 'self'; worker-src 'self' blob:` via a Vite build header or meta tag.
5. IF the user attempts to drag, copy, or select the passphrase input field value after entry, THE EncryptPanel and DecryptPanel SHALL NOT expose the raw passphrase string outside the input element's value binding.

---

### Requirement 13: Carrier Integrity Detection

**User Story:** As a recipient, I want the system to detect any corruption or re-encoding of the carrier PNG before attempting decryption so that I receive a clear error rather than silent garbage output.

#### Acceptance Criteria

1. WHEN the LSBExtractor reads a carrier PNG whose SHA-256 checksum over the extracted bitstream does not match the stored checksum, THE LSBExtractor SHALL post `{ error: "CHECKSUM_FAIL" }` and SHALL NOT pass any bytes to the CryptoWorker.
2. WHEN a checksum failure occurs, THE Application SHALL display "Carrier integrity check failed — the PNG may have been re-encoded in transit. Request a fresh lossless copy." to the user.
3. WHEN a spatial key mismatch causes AES-GCM tag verification to fail, THE Application SHALL display "Decryption failed — verify artifact positions match the sender's configuration." and SHALL allow the user to adjust artifact state and retry the decrypt action up to 10 times without re-transferring the carrier.
4. IF the user exceeds 10 consecutive retry attempts on the same carrier, THEN THE Application SHALL display an error indicating the retry limit has been reached and SHALL require the user to re-initiate the extract-and-decrypt action from the DecryptPanel.

---

### Requirement 14: Static Vite Build and Repository Setup

**User Story:** As a developer or judge, I want the project to build as a zero-backend static site and to have clear local run instructions so that evaluation and deployment require no server configuration.

#### Acceptance Criteria

1. THE Application SHALL build to a static Vite output directory containing only HTML, CSS, JavaScript, and asset files, with no Node.js runtime, server process, or backend API calls required to serve or operate the Application.
2. THE repository SHALL contain a root `LICENSE` file with MIT license text.
3. THE repository `README.md` SHALL include architecture notes and step-by-step local run instructions covering at minimum: the prerequisite Node.js version, the dependency install command, the dev server start command, and the URL at which the Application opens in the browser.

---

### Requirement 15: Automated Test Suite

**User Story:** As a developer, I want an automated test suite covering cryptographic correctness and steganographic round-trips so that regressions are caught before deployment.

#### Acceptance Criteria

1. THE test suite SHALL include unit tests in `tests/unit/` using Vitest covering: key derivation determinism (identical inputs produce identical 256-bit keys), LSB embed/extract round-trip, BitstreamLayout field encoding, and SpatialKeySerializer hash stability (identical SpatialKeySnapshot inputs produce identical SHA-256 output).
2. THE test suite SHALL include property-based tests in `tests/property/` using `fast-check` with a minimum of 500 iterations per property.
3. FOR ALL Payloads P of length 1 to 256 000 bytes, passphrases S of length 8 to 64 characters, and SpatialKeySnapshots K, the property test for AES-GCM round-trip SHALL verify that `decrypt(encrypt(P, S, K), S, K)` equals P byte-for-byte.
4. FOR ALL Payload byte sequences of length 1 to 256 000 bytes, the property test for LSB round-trip SHALL verify that `extract(embed(carrier, payload))` equals the original payload byte-for-byte.
5. FOR ALL SpatialKeySnapshot pairs K and K′ where K′ differs from K in any single field, the property test for wrong-key rejection SHALL verify that `decrypt(encrypt(P, S, K), S, K′)` throws an authentication error.
6. FOR ALL Payloads P of length greater than 256 000 bytes, the property test for payload size guard SHALL verify that `embed(carrier, P)` throws `PayloadTooLargeError` without modifying any pixel data.
7. FOR ALL SpatialKeySnapshot pairs K and K′ where K′ differs from K in any field, the property test for spatial key sensitivity SHALL verify that SHA-256(K) ≠ SHA-256(K′).
8. WHEN the test suite is executed, THE test runner SHALL exit with code 0 only if all unit and property-based tests pass with no failures.
