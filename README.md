# Cryptex3D

## Project Overview

Cryptex3D is a fully client-side, static web application. It encrypts a file, hides the ciphertext inside a lossless 1024×1024 PNG carrier using LSB steganography, audits the carrier for statistical anomalies, and moves it to a recipient peer-to-peer. The interface is an interactive 3D vault. The rotation state of three artifacts (a monolith, an 8-segment cryptex ring and a crystal) forms a **Spatial Key** that is combined with a passphrase. There is no backend and no signaling server.

## Architecture Notes

The code is split into four layers. Each layer may only depend on the one beneath it.

| Layer | Location | Responsibility |
|---|---|---|
| React 19 UI | `src/components/`, `src/App.tsx`, `src/store/` | HUD panels and application state (Zustand `vaultStore`). Never imports Three.js objects and never performs crypto inline. |
| Three.js scene | `src/scene/` | 60 fps WebGL render loop, the three artifacts, orbit controls, the `SpatialKeySerializer`, and a `WebGLFallback` panel when WebGL is unavailable. |
| Web Worker pipelines | `src/core/crypto/`, `src/core/stego/`, `src/core/auditor/` | CPU-heavy work off the main thread. Each pipeline runs in its own dedicated worker, started lazily and terminated after 30 s idle (`src/core/WorkerManager.ts`, orchestrated by `src/core/pipelineRunner.ts`). |
| P2P transport | `src/core/p2p/` | WebRTC `RTCDataChannel` with copy-paste or QR SDP exchange, and a `BroadcastChannel("cryptex3d-p2p")` fallback. It only moves raw bytes. |

Procedural audio lives in `src/core/audio/`. Bundles are split with Vite `manualChunks` (`three`, `react`, `tailwind`, per-worker chunks, `p2p`, `p2p-qr`, `auditor-ml`, `scene`).

### Pipeline

```
passphrase + Spatial Key
        |
   [1] derive key (PBKDF2-SHA-256)  ->  [2] encrypt (AES-256-GCM)
        |
   [3] embed into carrier PNG LSBs  ->  [4] audit (advisory)
        |
   [5] transfer (WebRTC or BroadcastChannel)
        |
   [6] extract from LSBs (magic + SHA-256 verified)  ->  [7] decrypt
```

Pipeline states shown in the HUD: `deriving`, `encrypting`, `embedding`, `auditing`, `transferring`, `extracting`, `decrypting`, `complete`, `error`.

Embedded bitstream layout (`src/core/stego/BitstreamLayout.ts`): 8-byte magic `43 52 59 50 54 33 44 00`, 4-byte big-endian payload length, payload (`iv ‖ salt ‖ ciphertext+tag`), then a 32-byte SHA-256 over everything before it. Bits are written to the LSBs of R, G and B only. The alpha channel is never touched.

### Spatial Key

The Spatial Key is the serialized state of the scene: monolith rotation (X, Y, Z), the positions (0–9) of the 8 ring segments, and whether the crystal is activated. `SpatialKeySerializer` writes these in a fixed order as JSON and takes its SHA-256 as a 64-character hex `serializedHash`, shown in the HUD. The PBKDF2 salt is `SHA-256(passphrase + serializedHash)[0..15]`, so a different artifact configuration produces a different key and decryption fails with an authentication error instead of returning wrong bytes. The recipient must reproduce the same artifact positions by hand. Nothing in the carrier reveals them.

## Security Notes

- **Encryption**: AES-256-GCM through the browser `crypto.subtle` API only. 12-byte random IV per encryption, 128-bit tag. No third-party crypto libraries.
- **Key derivation**: PBKDF2-HMAC-SHA-256, 310 000 iterations, 16-byte salt bound to both passphrase and Spatial Key. Derived keys are non-extractable. Passphrases must be 8–64 characters.
- **No backend**: all processing happens in the browser. The app makes no network calls of its own. SDP offers and answers are exchanged manually.
- **CSP**: built HTML carries `Content-Security-Policy: default-src 'self'; worker-src 'self' blob:`. `npm run preview` also sends it as a header. The dev server does not apply it, because React refresh and HMR need inline scripts and a websocket.
- **Limits**: maximum 250 KB (256 000 bytes) of embedded payload. Larger input is rejected before any pixel is modified. The carrier is always a 1024×1024 RGBA PNG, and the pixel data stays a `Uint8ClampedArray` end to end.
- **Integrity**: extraction verifies the magic header and checksum before decrypting. A mismatch shows a user-visible error.
- **No leaks**: plaintext, passphrases and key material are not logged, and error text is sanitized before it is displayed.
- **Auditor**: runs in a worker on the LSB plane only (chi-square, Shannon entropy, RS-style LSB pair analysis). Its score is advisory and never blocks the pipeline.

## Prerequisites

- Node.js >= 20
- A current Chromium, Firefox or Safari browser with WebGL2, Web Crypto, module Workers and `OffscreenCanvas`.

## Install

```bash
npm install
```

## Dev server

```bash
npm run dev
```

Open http://localhost:5173.

## Build

```bash
npm run build
```

This runs `tsc --noEmit` and then `vite build`. Use `npm run preview` to serve the build with the CSP header.

## Test

```bash
npm run test
```

This runs `vitest --run` over `tests/unit`, `tests/property` (fast-check) and `tests/integration`.

## Usage Walkthrough

### Judge Demo Mode (one click)

1. Start the app and click **Judge Demo Mode**.
2. It runs the whole pipeline on a fixed 1 024-byte payload with a fixed Spatial Key: encrypt, embed, audit, transfer over `BroadcastChannel` inside the same tab, extract, decrypt.
3. The stage label updates as it runs. When it finishes, the decrypted payload is shown as hex with a "Payload matches original" or "Payload mismatch" indicator. If it has not finished after 60 s it aborts with "Demo timed out".

### Manual flow in two browser tabs (Same-Device Mode)

1. Open the app in two tabs of the same browser and origin: sender and receiver.
2. **Sender**: rotate the monolith, click ring segments and hover the crystal to set the Spatial Key, and note the hash in the HUD. In the Encrypt panel, choose a file (up to 250 KB) and enter a passphrase of 8–64 characters. Click **Encrypt & Embed**. A noise carrier PNG is generated automatically. The Audit panel shows the score, warnings and recommendation. The **Advanced Audit** toggle applies to the next run.
3. **Sender**: in the P2P panel, enable **Same-Device Mode** and click **Send carrier**.
4. **Receiver**: also enable Same-Device Mode in the P2P panel so the tab listens. The carrier arrives in the Decrypt panel.
5. **Receiver**: set the artifacts to the same positions as the sender, enter the passphrase, and click **Extract & Decrypt**. Then use **Download decrypted file** (saved as `cryptex3d-payload.bin`).
6. A wrong Spatial Key or passphrase gives an authentication failure with no output. Up to 10 attempts are allowed on one carrier. After that, "Retry limit reached" appears and you must re-initiate from the Decrypt panel.

### Across devices (WebRTC)

In the P2P panel, the sender copies the SDP offer (text or QR) to the recipient out of band. The recipient pastes the answer back, and the sender then clicks **Send carrier**. If ICE does not connect within 30 s, the panel shows "Connection timed out" and offers **Switch to Same-Device Mode**. Same-Device Mode only works between tabs of one browser.

## Known Limitations

- **PNG codec paths are verified in browsers only.** PNG decode and encode use `OffscreenCanvas` and `createImageBitmap`, which are not available in the Node test environment. The unit, property and integration tests cover the crypto, bitstream, LSB, auditor and transport logic on raw pixel buffers. They do not cover the browser PNG round trip.
- **Advanced audit needs a local model.** The optional model score loads from `/models/cryptex-audit` on the same origin through `@huggingface/transformers`. No model is shipped. If it is missing, the audit silently falls back to the heuristic score.
- **The demo passphrase is public.** Judge Demo Mode uses the hard-coded `DEMO_PASSPHRASE` in `src/components/demoOrchestration.ts`. Never use it, or the demo Spatial Key, for real data.
- **No built-in carrier download.** The stego carrier is moved through the P2P panel. The Decrypt panel can load a PNG from a file, but there is no button to save the generated carrier to disk.
- **The carrier must stay lossless.** Re-encoding, resizing or color conversion (for example by messaging apps) destroys the payload, and extraction fails with a checksum error.
- **The Spatial Key is shared out of band.** The recipient must reproduce the artifact positions. Rotation values are continuous, so matching the monolith exactly by hand is hard in practice.
- **The 60 fps budget and the 150 KB gzip initial-bundle target** are design goals and depend on hardware. Verify them with a browser profile and `npm run build` output.
- **Manual SDP exchange only.** The app configures no STUN/TURN servers (`iceServers` is empty), so WebRTC generally only connects between peers that can reach each other directly, such as the same LAN. Use Same-Device Mode when it does not connect.

## License

MIT. See [LICENSE](LICENSE).
