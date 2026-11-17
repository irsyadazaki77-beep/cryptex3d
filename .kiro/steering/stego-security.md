# Stego-Security Steering — Cryptex3D

This document is active steering for the Kiro agent. Enforce these constraints on every crypto and steganography implementation decision.

## Cryptography

### Mandatory Primitives
- **Encryption**: AES-256-GCM via the browser-native `window.crypto.subtle` Web Crypto API only.
  - Key length: 256 bits.
  - IV: 12 bytes, generated with `crypto.getRandomValues` per encrypt call.
  - Authentication tag: 128 bits (default).
- **Key Derivation**: PBKDF2-SHA-256 via `crypto.subtle.deriveKey`.
  - Iterations: minimum 310 000 (OWASP 2024 recommendation for PBKDF2-HMAC-SHA-256).
  - Salt: 16 bytes minimum, derived from both the user passphrase AND the serialized 3D Spatial Key (artifact rotation state).
  - The final PBKDF2 salt MUST incorporate both inputs so that the wrong spatial key yields a decryption failure, not a silent bad decrypt.

### Forbidden Approaches
- No third-party crypto libraries (CryptoJS, sjcl, forge, etc.) — Web Crypto API only.
- No MD5 or SHA-1 for any security-relevant purpose.
- No ECB mode.
- No hardcoded keys, IVs, or salts anywhere in source code.
- No `Math.random()` for any security-relevant randomness.

## Lossless Carrier Handling

### PNG / Raw Pixel Data
- Carrier textures MUST be 1024×1024 RGBA PNG files encoded losslessly.
- Pixel data MUST flow as `Uint8ClampedArray` throughout the entire embed/extract pipeline.
- When applying a carrier texture as a Three.js texture:
  - Use `THREE.DataTexture` or `THREE.CanvasTexture`.
  - Set `texture.colorSpace = THREE.NoColorSpace` — this is MANDATORY to prevent gamma correction from altering LSB values.
  - Set `texture.generateMipmaps = false` — mipmaps resample pixel data and corrupt LSB payloads.
  - Set `texture.minFilter = THREE.NearestFilter` and `texture.magFilter = THREE.NearestFilter`.
- Never pass a carrier PNG through any compression, resizing, or color-space conversion after embed.

### LSB Steganography Bitstream Format
Every embedded bitstream MUST include, in order:
1. Magic header (8 bytes): identifies a Cryptex3D payload.
2. Payload length (4 bytes, big-endian uint32): byte count of the encrypted ciphertext.
3. Encrypted ciphertext (variable length).
4. SHA-256 checksum (32 bytes): covers bytes 1–3 of this structure; verified on extraction before decryption.

Extraction MUST verify the magic header and SHA-256 checksum before attempting decryption. A mismatch MUST surface as a user-visible error, not a silent failure.

### Payload Limits
- Maximum embedded payload: 250 KB (256 000 bytes) of ciphertext.
- Attempting to embed a payload exceeding this limit MUST throw a typed error before any pixel data is modified.

## Zero Plaintext Logging

The following data MUST NEVER appear in `console.log`, `console.debug`, `console.error`, error messages surfaced to the UI, or any analytics/telemetry:
- Plaintext secret content.
- Raw passphrase strings.
- Derived key material (`CryptoKey` objects or their extracted bytes).
- Decrypted payload bytes.

Acceptable to log: operation names, byte lengths, timing durations, error codes.

## Auditor Constraints (`src/core/auditor/`)
- Must run entirely in a Web Worker — no blocking analysis on the main thread.
- Chi-Square and Shannon entropy calculations must operate on the carrier PNG's LSB plane only, not on the full RGB channels, to avoid false positives from natural image statistics.
- Auditor results are advisory only; they MUST NOT block the embed/extract pipeline.
- Zero external API calls; all analysis is pure-JS or optional `@huggingface/transformers` loaded locally.
