# Implementation Plan: Kiroween Winning Plan

## Overview

Rencana 15 hari dalam TypeScript (React 19, Three.js, Vite, Vitest, fast-check) di atas kode Cryptex3D yang ada. Urutan mengikuti `design.md`: hari 1-2 Fase 1, hari 3 Fase 2, hari 4-7 Fase 3, hari 8-9 Fase 4, hari 10-11 Fase 5, hari 12-14 Fase 6, hari 15 buffer tanpa pekerjaan fitur.

Aturan yang berlaku di semua tugas:

- Steering `ui-theme`, `stego-security`, dan `architecture` tetap berlaku. Logika baru berupa fungsi murni di `src/core/shared/`, `src/core/crypto/`, atau `src/core/p2p/`. Komponen dan scene tidak mengimpor `src/core/crypto/` dan tidak menyentuh passphrase atau material kunci.
- Tes properti memakai fast-check dengan tag `Feature: kiroween-winning-plan, Property N: <judul>`. Minimum 100 iterasi untuk fungsi murni. Operasi PBKDF2 310 000 iterasi memakai `numRuns` 10 sampai 20 dan iterasi produksi tidak dikurangi.
- Spec `vault-visual-drama-tactile-feedback` dirujuk apa adanya. Isinya tidak diulang di sini. Tugas Hari 3 hanya menunjuk nomor tugas di `.kiro/specs/vault-visual-drama-tactile-feedback/tasks.md`.
- Langkah non-kode (rekam video, unggah, submit, tangkap layar, uji manual lintas-browser) ditulis sebagai berkas checklist di repo. Tugas di bawah hanya membuat atau memperbarui berkas itu.

## Tasks

- [ ] 1. Hari 1 (Fase 1): Plan_Tracker, CSP, anggaran bundle, panduan deploy
  - [ ] 1.1 Buat `plan-tracker.md` dan validator jadwal
    - Buat `.kiro/specs/kiroween-winning-plan/plan-tracker.md` dengan tabel `Day | Phase | Deliverable | Done-condition | Status | Verified` untuk hari 1-15 sesuai pemetaan di `design.md`
    - Isi status awal `planned`, tandai hari 15 sebagai `buffer`, tandai model audit lokal sebagai `stretch`, sediakan kolom hash commit freeze dan bagian hasil per browser
    - Buat `scripts/planTracker.mjs` yang mem-parse tabel dan memvalidasi: tiap hari tepat satu fase atau buffer, tiap fase punya deliverable dengan done-condition, minimal satu hari buffer tanpa fitur setelah hari freeze; kembalikan aturan yang dilanggar
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 17.4, 18.1, 18.8_

  - [ ] 1.2* Tulis tes properti untuk validator jadwal
    - `tests/property/planTracker.property.test.ts`
    - **Property 24: Jadwal rencana valid**
    - **Validates: Requirements 1.1, 1.2, 1.3, 18.8**

  - [ ] 1.3 Satukan sumber CSP dan perketat header deploy
    - Buat `src/core/shared/csp.ts` (konstanta string tanpa impor) dengan nilai CSP target dari `design.md` (tanpa `data:` dan `blob:` di `img-src`, `worker-src 'self' blob:`)
    - Ubah `vite.config.ts` agar meta CSP dan header `vite preview` memakai konstanta itu
    - Ubah `vercel.json` dengan CSP yang sama ditambah `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, dan `Permissions-Policy: camera=(self), microphone=(), geolocation=()`
    - Pastikan `assetsInlineLimit` tetap 0
    - _Requirements: 2.3, 2.4, 2.5, 19.1_

  - [ ]* 1.4 Tulis tes contoh paritas CSP
    - `tests/unit/csp.test.ts`: header `vercel.json` sama dengan konstanta, tidak ada `data:`, `unsafe-inline`, `unsafe-eval`, dan origin skrip eksternal
    - _Requirements: 2.3, 2.4_

  - [ ] 1.5 Buat `scripts/check-bundle.mjs`
    - Baca `dist/index.html`, kumpulkan JS awal (entry dan `modulepreload`), hitung ukuran gzip, gagal bila >= 150 KiB, dan cetak daftar chunk dinamis `scene`, `crypto`, `stego`, `auditor`, `p2p`, `audio`
    - Tambahkan skrip `check:bundle` di `package.json`
    - _Requirements: 2.6_

  - [ ] 1.6 Tulis `docs/deploy.md` sebagai checklist deploy
    - Langkah build, `check:bundle`, publikasi ke Vercel, verifikasi HTTPS, pengecekan waktu muat < 5 detik cold cache, dan pengecekan nol `securitypolicyviolation` pada alur Judge_Demo, masing-masing dengan kotak centang dan kolom hasil
    - _Requirements: 2.1, 2.2, 2.5_

- [ ] 2. Hari 2 (Fase 1): Transfer QR SDP dan unduh carrier
  - [ ] 2.1 Implementasikan `src/core/p2p/qrFrames.ts`
    - `splitSdp`, `parseFrame`, `QrReassembler` (`accept`, `missing`, `isComplete`, `assemble`), format `CX3Q1.<sid>.<index>.<total>.<base64url>.<crc32>`, `QR_CHUNK_CHARS = 600`, kode `QR_MALFORMED | QR_CRC | QR_SESSION_MISMATCH | QR_TOTAL_MISMATCH`
    - Tanpa impor crypto, stego, React, atau Three.js; `sid` dari `crypto.getRandomValues`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 10.7_

  - [ ]* 2.2 Tulis tes properti round trip frame QR
    - `tests/property/qrFrames.property.test.ts`
    - **Property 17: Round trip frame QR**
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [ ]* 2.3 Tulis tes properti frame hilang atau rusak
    - `tests/property/qrFramesMissing.property.test.ts`
    - **Property 18: Frame yang hilang atau rusak dilaporkan**
    - **Validates: Requirements 3.4**

  - [ ] 2.4 Render QR di `<canvas>` dan hubungkan ke panel P2P
    - Dependensi `qrcode` dan `@types/qrcode` sudah ada di `package.json`. Buat `src/components/QrFrameView.tsx` (impor dinamis, chunk `p2p-qr`, `QRCode.create`, `fillRect` integer, quiet zone 4 modul, tombol Invert, Prev/Next, penghitung `i / n`, auto-advance 1,5 detik, `role="img"` dan `aria-label`)
    - Tambahkan kolom tempel frame dengan daftar indeks hilang dari `QrReassembler.missing`; pemindaian kamera lewat `BarcodeDetector` bila ada, jika tidak tampilkan pesan kapabilitas yang hilang
    - Hapus `getOfferQRDataURL()` dari `SDPNegotiator.ts` (yang memakai `QRCode.toDataURL`), ganti pemanggilnya di `P2PPanel.tsx` (state `qrUrl` dan `<img>`), perbarui tes yang memakainya, pertahankan textarea SDP copy-paste di `P2PPanel.tsx`, dan pastikan tidak ada `toDataURL`, `<img>` untuk QR, atau blob URL
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 2.4, 11.2, 19.4, 19.5_

  - [ ] 2.5 Tambahkan Carrier_Download di `EncryptPanel.tsx`
    - Tombol Download aktif saat `stegoCarrier` ada, memakai `useBlobUrl` dan anchor `download` dengan nama konstan `cryptex3d-carrier.png`; tanpa carrier tombol `disabled` berlabel "No embedded carrier"
    - Byte diunduh apa adanya dari hasil `encodePNG`, tanpa resize atau re-encode
    - _Requirements: 4.1, 4.2, 4.4, 4.5_

  - [ ]* 2.6 Tulis tes integrasi unduh carrier
    - `tests/integration/carrierDownload.test.ts`: byte unduhan sama dengan `stegoCarrier`, dekode piksel identik 1024x1024 RGBA, ekstraksi dari PNG unduhan mengembalikan payload yang sama, tombol disabled tanpa carrier, nama berkas tidak memuat passphrase atau payload
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

- [ ] 3. Checkpoint - Akhir Fase 1
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Hari 3 (Fase 2): Spec visual-drama dan pengerjaan penuh spec rujukan
  - [ ] 4.1 Buat direktori `.kiro/specs/visual-drama/`
    - Buat `requirements.md`, `design.md`, `tasks.md` tipis yang menunjuk ke `.kiro/specs/vault-visual-drama-tactile-feedback/` sebagai isi spec, tanpa menyalin isinya
    - Di `requirements.md` dan `design.md` tulis batasan yang diwarisi: anggaran 4 ms per frame, glow HUD hanya `opacity` dan `filter: blur()`, bloom boleh mati tanpa mematikan efek lain, dispose semua resource saat teardown, tekstur carrier `NoColorSpace`, `NearestFilter`, tanpa mipmap
    - Tambahkan baris pelacakan di `plan-tracker.md` untuk Fase 2
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ] 4.2 Kerjakan bagian pertama spec rujukan
    - Jalankan tugas 1.1-1.3, 2.1-2.3, 3.1-3.5, 4.1-4.4 pada `.kiro/specs/vault-visual-drama-tactile-feedback/tasks.md`
    - Ikuti penandaan `*` di spec itu; sub-tugas bertanda `*` tidak dikerjakan kecuali diminta
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 19.4_

  - [ ] 4.3 Kerjakan bagian kedua spec rujukan
    - Jalankan tugas 6.1, 7.1, 8.1-8.4 pada spec rujukan yang sama (Horcrux tethers, data stream, wiring HUD, mute toggle) dan daftarkan factory di `defaultArtifacts.ts`
    - _Requirements: 5.2, 5.4, 5.5, 19.4, 19.6_

  - [ ] 4.4 Verifikasi spec rujukan
    - Jalankan tugas 10.1-10.3 pada spec rujukan (`npx tsc --noEmit`, `npx vitest --run`, `npm run build`) dan catat hasil di `plan-tracker.md`
    - Pelaksanaan commit dan push (tugas 10.4 spec rujukan) mengikuti keputusan pemilik repositori
    - Bila Fase 2 tidak selesai dalam sehari, catat sebagai `carried-over` ke hari 15 atau sebagai keputusan descope
    - _Requirements: 1.4, 1.5, 5.2_

- [ ] 5. Checkpoint - Akhir Fase 2
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Hari 4 (Fase 3): Snap kisi Spatial Key
  - [ ] 6.1 Implementasikan `src/core/shared/spatialSnap.ts`
    - `SNAP_STEPS = [5, 10, 15, 30, 45, 90]`, `DEFAULT_SNAP_STEP = 15`, `snapDegrees`, `snapMonolith`, `isOnGrid`, `SnapInputError` untuk NaN dan Infinity
    - _Requirements: 6.1, 6.3, 6.4_

  - [ ]* 6.2 Tulis tes properti snap
    - `tests/property/spatialSnap.property.test.ts`
    - **Property 1: Snap menghasilkan titik kisi terdekat**
    - **Validates: Requirements 6.1, 6.3**

  - [ ] 6.3 Hubungkan snap ke scene dan bridge
    - Di handler pointer-up artefak (`src/scene/controls/`) panggil `snapMonolith` sebelum `ArtifactState.setMonolithRot`
    - Selama drag gambar siluet wireframe emisif dari pose snap terdekat (geometri dipakai ulang, material didaftarkan untuk dispose)
    - Tambahkan `setSnapStep` ke `sceneBridge.ts`; scene men-snap ulang rotasi lalu `emit`; simpan langkah di `localStorage` kunci `cx3.snapStep` dengan validasi terhadap `SNAP_STEPS`
    - `SpatialKeySerializer.serialize` tetap menerima sudut float
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 5.5_

  - [ ]* 6.4 Tulis tes properti serialisasi kanonik
    - `tests/property/spatialKeyCanonical.property.test.ts`
    - **Property 2: Serialisasi Spatial Key kanonik**
    - **Validates: Requirements 6.2**

  - [ ]* 6.5 Tulis tes properti re-snap
    - `tests/property/spatialResnap.property.test.ts`
    - **Property 3: Re-snap pada langkah baru**
    - **Validates: Requirements 6.4**

  - [ ] 6.6 Tambahkan pemilih langkah snap di `SpatialKeyDisplay.tsx`
    - Kontrol langkah dengan gaya dari `hudStyles.ts`, ikon Lucide, teks fungsional, memanggil `sceneBridge.setSnapStep`
    - _Requirements: 6.4, 19.4_

- [ ] 7. Hari 5 (Fase 3): Ekspor dan impor Spatial Key
  - [ ] 7.1 Implementasikan `src/core/shared/spatialKeyCodec.ts`
    - `encodeKeyFile`, `decodeKeyFile` (batas 2 048 byte, skema ketat, urutan kunci tetap), `encodeKeyCode` dan `decodeKeyCode` (`CX3K1-` Crockford base32, payload 12 byte dengan checksum 16 bit), `keyValueEquals`, `SpatialKeyImportError` dengan kode `SK_*` dan pesan tetap
    - _Requirements: 7.1, 7.2, 7.4, 7.5_

  - [ ]* 7.2 Tulis tes properti round trip ekspor/impor
    - `tests/property/spatialKeyCodec.property.test.ts`
    - **Property 4: Round trip ekspor/impor Spatial Key**
    - **Validates: Requirements 7.1, 7.2, 7.4**

  - [ ]* 7.3 Tulis tes properti penolakan impor
    - `tests/property/spatialKeyImportReject.property.test.ts`
    - **Property 5: Impor menolak berkas tidak valid dengan kode**
    - **Validates: Requirements 7.5**

  - [ ] 7.4 Buat `SpatialKeyPanel.tsx` dan `requestImportedKey`
    - Tombol Export (berkas `cryptex3d-spatial-key.json` lewat Blob anchor, kode teks di `<pre>` monospace), kolom Import (tempel JSON atau kode, atau `<input type="file" accept=".json,application/json">`), peringatan fungsional bahwa berkas kunci adalah faktor rahasia
    - Tambahkan `sceneBridge.requestImportedKey(value)` yang menerapkan nilai ke `ArtifactState` lalu `emit`; error ditampilkan dengan kode `SK_*`; pasang panel di `SpatialKeyDisplay.tsx`
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 19.2, 19.5_

- [ ] 8. Hari 6 (Fase 3): Vault Combination dan KDF v2
  - [ ] 8.1 Implementasikan `src/core/crypto/kdfV2.ts`
    - `KDF_V2_LABEL`, `MAX_VAULT_KEYS = 4`, `canonicalFactors` (urut leksikografis, tolak duplikat), `composeSalt` (SHA-256 dengan awalan panjang, 32 byte), `deriveKeyV2` (PBKDF2-SHA-256, 310 000 iterasi, AES-GCM 256, non-extractable)
    - _Requirements: 6.5, 8.1, 8.3, 8.4, 19.1_

  - [ ]* 8.2 Tulis tes properti komposisi salt
    - `tests/property/kdfV2Salt.property.test.ts`
    - **Property 6: Komposisi salt KDF v2**
    - **Validates: Requirements 6.5, 8.1**

  - [ ] 8.3 Hubungkan KDF v2 ke `CryptoWorker`, `Encryptor`, dan `Decryptor`
    - Tambahkan `keyHashes?: string[]` pada payload encrypt dan decrypt, salt acak 16 byte dan IV 12 byte baru per encrypt, simpan salt di slot blob yang ada
    - Decrypt mode tunggal: coba v2, bila `AuthFailError` coba v1 lama; semua kegagalan memakai satu kode `AUTH_FAIL`; hapus buffer sementara dengan `fill(0)`; tanpa `console.*` berisi rahasia
    - _Requirements: 6.5, 8.1, 8.2, 8.3, 8.4, 8.5, 16.2, 19.1, 19.3_

  - [ ]* 8.4 Tulis tes properti round trip enkripsi/dekripsi
    - `tests/property/cryptoRoundTrip.property.test.ts` dengan `numRuns` kecil
    - **Property 7: Round trip enkripsi/dekripsi**
    - **Validates: Requirements 8.1, 16.2**

  - [ ]* 8.5 Tulis tes properti faktor salah atau hilang
    - `tests/property/wrongFactor.property.test.ts` dengan `numRuns` kecil
    - **Property 8: Faktor yang salah atau hilang gagal terautentikasi**
    - **Validates: Requirements 6.5, 8.2**

  - [ ]* 8.6 Tulis tes properti IV dan salt segar
    - `tests/property/freshIvSalt.property.test.ts` dengan `numRuns` kecil
    - **Property 9: IV dan salt segar per enkripsi**
    - **Validates: Requirements 8.3, 8.4**

  - [ ] 8.7 Tambahkan Key slots di store dan panel Encrypt/Decrypt
    - Tambahkan `keySlots`, `snapStep`, `decoyEnabled` ke store (hanya hash dan metadata), aksi `captureSlot` dan reset, penolakan slot ganda dengan `INVALID_INPUT`, batas 1 sampai 4 slot
    - Daftar "Key slots" di `EncryptPanel.tsx` dan `DecryptPanel.tsx`; hanya string hash yang diteruskan ke worker
    - _Requirements: 8.1, 8.2, 19.2, 19.6_

  - [ ]* 8.8 Tulis tes properti round trip embed/extract
    - `tests/property/embedExtract.property.test.ts`
    - **Property 10: Round trip embed/extract dan bitstream tidak berubah**
    - **Validates: Requirements 4.3, 8.5**

- [ ] 9. Hari 7 (Fase 3): Decoy Mode
  - [ ] 9.1 Implementasikan `src/core/crypto/decoyContainer.ts`
    - `CONTAINER_BUCKETS`, `bucketFor`, `isContainerShape`, `sealContainer` (dua slot sama ukuran, slot asli acak per embed, slot filler byte acak, tolak kredensial sama), `openContainer` (selalu 2 KDF dan 2 GCM tanpa early exit, satu `AuthFailError`, hook `onKdf` dan `onGcm`)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 8.6_

  - [ ] 9.2 Tambahkan op `encryptContainer` dan `decryptContainer` ke `CryptoWorker`
    - Definisikan `EncryptContainerRequest/Response` dan `DecryptContainerRequest/Response`; `PayloadTooLargeError` dilempar sebelum embed
    - _Requirements: 9.1, 9.2, 9.3, 9.5, 19.3_

  - [ ] 9.3 Ubah alur `src/core/pipelineRunner.ts` untuk memilih jalur
    - Decrypt memakai `stego.extractRaw` lalu memilih kontainer bila `isContainerShape`, jika tidak `unpackPayload` dan decrypt tunggal; encrypt tunggal membungkus envelope TTL `expiresAt = 0` bila blob berbentuk kontainer; bitstream luar tidak berubah
    - _Requirements: 8.5, 9.4, 9.6_

  - [ ] 9.4 Tambahkan toggle "Duress container" di `EncryptPanel.tsx`
    - Payload umpan, passphrase umpan, dan slot Spatial Key umpan opsional; teks fungsional; panel Decrypt tidak berubah
    - _Requirements: 9.1, 9.2, 9.3, 19.2, 19.4_

  - [ ]* 9.5 Tulis tes properti batas ukuran
    - `tests/property/payloadLimit.property.test.ts`
    - **Property 11: Payload melebihi batas ditolak sebelum piksel berubah**
    - **Validates: Requirements 8.6, 9.5**

  - [ ]* 9.6 Tulis tes properti slot dekoy
    - `tests/property/decoySlots.property.test.ts` dengan `numRuns` kecil
    - **Property 13: Kredensial dekoy hanya membuka slot masing-masing**
    - **Validates: Requirements 9.1, 9.2, 9.3**

  - [ ]* 9.7 Tulis tes properti kegagalan seragam dan kerja konstan
    - `tests/property/decoyUniform.property.test.ts` dengan `numRuns` kecil, menghitung operasi lewat `hooks`
    - **Property 14: Kegagalan kontainer tidak dapat dibedakan dan kerja konstan**
    - **Validates: Requirements 9.4**

  - [ ]* 9.8 Tulis tes properti ukuran kontainer
    - `tests/property/decoySize.property.test.ts`
    - **Property 15: Ukuran kontainer tidak membocorkan slot asli**
    - **Validates: Requirements 9.5, 9.1**

  - [ ]* 9.9 Tulis tes properti mode tunggal bukan kontainer
    - `tests/property/singleNotContainer.property.test.ts`
    - **Property 16: Mode tunggal tidak pernah berbentuk kontainer**
    - **Validates: Requirements 9.4**

- [ ] 10. Checkpoint - Akhir Fase 3
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Hari 8 (Fase 4): Konfigurasi ICE
  - [ ] 11.1 Implementasikan `src/core/p2p/iceConfig.ts`
    - `IceConfig`, `DEFAULT_ICE_SERVERS`, `MAX_ICE_SERVERS = 8`, `validateIceConfig` (skema `stun|stuns|turn|turns`, host, port, kredensial TURN wajib, kredensial STUN dilarang, `field` per entri), `toRtcConfiguration` (mode `local` memberi `iceServers: []`), `redactIceConfig`
    - _Requirements: 10.1, 10.3, 10.4, 10.5, 10.7_

  - [ ]* 11.2 Tulis tes properti validasi ICE
    - `tests/property/iceConfig.property.test.ts`
    - **Property 19: Validasi dan round trip konfigurasi ICE**
    - **Validates: Requirements 10.1, 10.2, 10.4**

  - [ ]* 11.3 Tulis tes properti kebocoran kredensial TURN
    - `tests/property/iceRedact.property.test.ts`
    - **Property 20: Kredensial TURN tidak bocor**
    - **Validates: Requirements 10.3**

  - [ ] 11.4 Tambahkan penyimpanan ICE dan injeksi di `P2PManager`
    - `src/components/iceConfigStorage.ts` (kunci `cx3.ice.v1`, data rusak diganti default tanpa melempar), `P2PManager` menerima `iceServers` lewat konstruktor, `P2PError` hanya memuat kode dan teks tetap
    - _Requirements: 10.1, 10.2, 10.3, 10.5, 10.7_

  - [ ] 11.5 Buat `IceConfigForm.tsx` dan sambungkan ke `P2PPanel.tsx`
    - Form dengan kolom `credential` bertipe `password` dan font mono, error menyebut nama kolom, tampilan konfigurasi memakai `redactIceConfig`
    - Aktifkan fallback BroadcastChannel otomatis saat `iceTimeout`, `statechange = failed`, atau `RTCPeerConnection` tidak tersedia
    - _Requirements: 10.2, 10.3, 10.4, 10.6, 19.4, 19.5_

  - [ ]* 11.6 Tulis tes contoh ICE default dan fallback
    - `tests/unit/iceFallback.test.ts`: STUN default sesuai dokumentasi, `RTCPeerConnection = undefined` memilih BroadcastChannel, pesan error tidak memuat kredensial
    - _Requirements: 10.3, 10.5, 10.6_

- [ ] 12. Hari 9 (Fase 4): Lintas-browser
  - [ ] 12.1 Implementasikan `src/core/shared/capabilities.ts`
    - Kembalikan daftar nama kapabilitas yang hilang (`crypto.subtle`, `OffscreenCanvas`, `RTCPeerConnection`, `BroadcastChannel`, `BarcodeDetector`) dan tampilkan pesan yang menyebut kapabilitas di UI
    - _Requirements: 11.2_

  - [ ]* 12.2 Tulis tes contoh kapabilitas dan WebGL
    - `tests/unit/capabilities.test.ts`: pesan menyebut kapabilitas hilang, `WebGLFallback` saat renderer gagal, urutan konteks hilang dan pulih (jeda, tunggu 4 detik, remount atau fallback)
    - _Requirements: 11.2, 11.3, 11.4_

  - [ ] 12.3 Buat `docs/cross-browser-checklist.md`
    - Matriks Chrome, Firefox, Edge, Safari x {encrypt, embed, download, extract, decrypt, P2P, QR, snap/export/import, decoy} dengan kolom hasil, tanggal, dan masalah diketahui, plus catatan risiko `OffscreenCanvas.convertToBlob` di Safari lama
    - _Requirements: 11.1, 11.5_

- [ ] 13. Checkpoint - Akhir Fase 4
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Hari 10 (Fase 5): Guided Tour dan Tripwire
  - [ ] 14.1 Implementasikan `src/components/tourReducer.ts`
    - State `{ active, index, completed }`, aksi `start | next | back | skip | finish`, daftar langkah tetap (Command Dock, Spatial Key readout, Zen toggle, Judge Demo), indeks selalu dalam batas
    - _Requirements: 12.1, 12.2, 12.5_

  - [ ]* 14.2 Tulis tes properti reducer tur
    - `tests/property/tourReducer.property.test.ts`
    - **Property 22: Reducer tur tetap dalam batas**
    - **Validates: Requirements 12.2, 12.5**

  - [ ] 14.3 Buat `GuidedTour.tsx` dan pasang di `App.tsx`
    - Kartu kaca kecil di dekat target lewat atribut `data-tour` dan konteks React (tanpa `document.querySelector` di luar akar React), tombol Back, Next, Skip, ikon Lucide, penutupan kanvas <= 40%, flag `cx3.tour.v1` di `localStorage` dan tidak auto-start ulang
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 19.4_

  - [ ] 14.4 Implementasikan `src/core/stego/tamper.ts` dan carrier terstruktur
    - `flipLsbFraction` deterministik (langkah `round(1 / fraction)`, mulai setelah header 96 bit, tanpa `Math.random`), serta fungsi carrier penutup terstruktur dan deterministik di `src/core/shared/carrierGenerator.ts`
    - _Requirements: 13.1, 13.3_

  - [ ]* 14.5 Tulis tes properti tamper
    - `tests/property/tamper.property.test.ts`
    - **Property 23: Tamper Tripwire sesuai fraksi dan memicu checksum**
    - **Validates: Requirements 13.1, 13.3**

  - [ ]* 14.6 Tulis tes properti deteksi bit berubah
    - `tests/property/bitstreamTamper.property.test.ts`
    - **Property 12: Perubahan bit pada bitstream terdeteksi**
    - **Validates: Requirements 9.6, 13.3**

  - [ ] 14.7 Buat skenario Tripwire di UI
    - `src/components/TripwireScenario.tsx` dipasang di `AuditPanel.tsx`: carrier terstruktur, audit bersih, embed, ubah fraksi, audit ditandai dengan peringatan crimson dan nilai Chi-Square dan entropi Shannon bidang LSB, ekstraksi menampilkan `CHECKSUM_FAIL`
    - Auditor tetap di Web Worker, hanya menasihati, tanpa panggilan jaringan, micro-copy fungsional
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

  - [ ]* 14.8 Tulis tes contoh kalibrasi Tripwire
    - `tests/unit/tripwireScenario.test.ts`: verdict "clean" pra-embed dan "flagged" pasca-tamper pada fixture; bila gagal, sesuaikan ukuran payload skenario, bukan ambang auditor
    - _Requirements: 13.2, 13.4, 13.5_

- [ ] 15. Hari 11 (Fase 5): Judge Demo dan higiene log
  - [ ] 15.1 Tambahkan `AbortSignal` dan tombol Cancel pada Judge Demo
    - `runDemo(deps)` menerima `options.signal`; Cancel di `DemoModeOrchestrator.tsx` memanggil `abort()` yang menutup kanal, membatalkan timer, dan men-terminate worker; stepper menandai langkah selesai dan langkah gagal
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.6_

  - [ ]* 15.2 Tulis tes contoh Judge Demo
    - `tests/unit/judgeDemo.test.ts` dengan `DemoDeps` palsu: urutan lima langkah, langkah gagal berhenti dan ditandai, error tersanitasi, cancel melepas worker, kanal, dan timer
    - _Requirements: 14.1, 14.2, 14.4, 14.6_

  - [ ]* 15.3 Tulis tes integrasi hasil Judge Demo
    - `tests/integration/judgeDemo.test.ts`: payload hasil dekripsi sama dengan payload awal, alur selesai dalam 60 detik pada lingkungan uji
    - _Requirements: 14.3, 14.5_

  - [ ] 15.4 Perkuat `errorSanitizer.ts` dan audit jalur log
    - Pastikan sanitizer menghapus passphrase, plaintext, dan hash kunci dari string error arbitrer; tinjau jalur crypto, stego, dan auditor agar tidak ada `console.*` berisi rahasia
    - _Requirements: 14.4, 16.6, 19.1, 19.2_

  - [ ]* 15.5 Tulis tes properti higiene log
    - `tests/property/logHygiene.property.test.ts` dengan `numRuns` kecil, menyadap `console.*`
    - **Property 21: Tidak ada rahasia di keluaran konsol dan error**
    - **Validates: Requirements 14.4, 16.6, 19.1, 19.2**

  - [ ]* 15.6 Tulis tes smoke batas lapisan
    - `tests/unit/boundaries.test.ts`: `src/scene/` dan `src/components/` tidak mengimpor `src/core/crypto/`, `src/core/p2p/` tidak mengimpor `crypto/` atau `stego/`, tidak ada pustaka kripto pihak ketiga di `package.json`, worker memakai envelope bertipe
    - _Requirements: 19.1, 19.2, 19.3, 19.6_

- [ ] 16. Checkpoint - Akhir Fase 5
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 17. Hari 12 (Fase 6): Threat model, tautan dokumen, stretch
  - [ ] 17.1 Tulis `docs/threat-model.md`
    - Aset, adversari, batas kepercayaan, permukaan serang (encrypt, embed, extract, P2P, Auditor), tiap ancaman dengan mitigasi dan tautan berkas atau tes
    - Parameter kripto (PBKDF2 310 000 iterasi, AES-256-GCM, IV 12 byte, tag 128 bit, komposisi salt v1 dan v2), batasan jujur Decoy_Mode dan Vault_Combination (poin a sampai e di `design.md`), ruang kunci Spatial Key, SDP tidak terautentikasi, kredensial TURN di `localStorage`, dan steganografi tidak menyembunyikan keberadaan data dari adversari statistik
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [ ]* 17.2 Stretch: model audit lokal di `AuditorWorker`
    - Muat model lewat `@huggingface/transformers` sebagai chunk dinamis `auditor-ml` hanya atas permintaan pengguna, tambahkan skor model sebagai nilai nasihat di samping skor heuristik, dan kembalikan laporan heuristik dengan `modelUnavailable` bila gagal dimuat
    - Tanpa panggilan API eksternal, tanpa perubahan CSP default; bila `'wasm-unsafe-eval'` diperlukan, catat sebagai keputusan terpisah di `plan-tracker.md`. Dapat di-descope tanpa memengaruhi tugas lain
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

  - [ ]* 17.3 Tulis tes contoh model audit lokal
    - `tests/unit/localAuditModel.test.ts`: kegagalan muat mengembalikan laporan heuristik dengan penanda, model tidak ada di bundle awal
    - _Requirements: 17.3, 17.5_

  - [ ] 17.4 Buat `scripts/check-doc-links.mjs`
    - Periksa bahwa setiap path berkas yang dirujuk di README, `docs/*.md`, dan `plan-tracker.md` ada; tambahkan skrip `check:docs` di `package.json`
    - _Requirements: 16.3, 16.5_

- [ ] 18. Hari 13 (Fase 6): Freeze dan Submission Package
  - [ ] 18.1 Catat Freeze di `plan-tracker.md`
    - Awal hari 13: jalankan `git rev-parse HEAD`, tulis hash commit freeze dan tanggalnya, dan tulis aturan bahwa hanya perbaikan cacat yang merusak Judge_Demo atau build yang boleh masuk
    - _Requirements: 18.1, 18.2_

  - [ ] 18.2 Tulis ulang `README.md`
    - Deskripsi proyek, URL live (placeholder bertanda sampai deploy), perintah setup, ringkasan arsitektur, ringkasan model keamanan dengan tautan ke `docs/threat-model.md`, ringkasan penggunaan Kiro; hapus known issue QR dan CSP yang sudah teratasi dan dokumentasikan STUN default beserta implikasi IP publik
    - _Requirements: 18.3, 10.5, 3.6_

  - [ ] 18.3 Buat `docs/screenshots-checklist.md`
    - Lima tangkapan layar minimum (Command Dock, adegan 3D, peringatan audit, panel P2P, stepper Judge_Demo) dengan nama berkas target di `docs/screenshots/`, resolusi, kondisi UI, dan kotak centang; tambahkan `docs/screenshots/.gitkeep`
    - _Requirements: 18.4_

  - [ ] 18.4 Tulis `docs/video-script.md`
    - Skrip maksimum 3 menit dengan segmen bertempo (masalah, demo, keamanan, penggunaan Kiro), tiap klaim bertanda rujukan ke entri di `docs/evidence.md`, total durasi dijumlahkan di akhir
    - _Requirements: 18.5, 16.5_

  - [ ] 18.5 Buat `docs/video-recording-checklist.md`
    - Langkah non-kode: persiapan peramban bersih, resolusi, latihan, rekam, ekspor, unggah, tautan publik, uji tonton dari akun lain, dengan kotak centang dan kolom hasil
    - _Requirements: 18.5_

  - [ ] 18.6 Buat `docs/submission-checklist.md`
    - URL dapat dijangkau, repositori publik, lisensi sumber terbuka, tautan video, kolom kategori, tautan repositori, dan tenggat, dengan kotak centang, status, dan penanggung jawab
    - _Requirements: 18.6_

  - [ ] 18.7 Buat kerangka `docs/evidence.md`
    - Bagian hasil `vitest --run` (jumlah lulus, tanggal), pemetaan spec, steering, dan hook Kiro ke fitur atau cacat dengan path berkas, dan tabel klaim ke bukti
    - _Requirements: 16.1, 16.3, 16.4, 16.5_

- [ ] 19. Hari 14 (Fase 6): Verifikasi akhir
  - [ ] 19.1 Jalankan verifikasi penuh dan isi `docs/evidence.md`
    - Jalankan `npx tsc --noEmit`, `npx vitest --run`, `npm run build`, `npm run check:bundle`, `npm run check:docs`; semua harus nol kegagalan dan JS awal < 150 KiB
    - Tulis hasil, jumlah lulus, dan tanggal ke `docs/evidence.md`; perbaiki kegagalan sebelum melanjutkan
    - _Requirements: 16.1, 16.2, 16.5, 18.7, 2.6_

  - [ ] 19.2 Perbarui `plan-tracker.md`
    - Isi tanggal selesai dan hasil verifikasi tiap deliverable, tandai yang `carried-over` atau `descoped`, dan salin hasil browser dari `docs/cross-browser-checklist.md`
    - _Requirements: 1.4, 1.5, 11.5, 17.4_

- [ ] 20. Hari 15 (Buffer): tanpa pekerjaan fitur
  - [ ] 20.1 Tutup tracker dan checklist
    - Hanya perbaikan cacat yang merusak Judge_Demo atau build; perbarui status di `docs/submission-checklist.md`, `docs/deploy.md`, dan `plan-tracker.md`, selesaikan item `carried-over` atau catat descope, dan pastikan hari 15 tidak berisi tugas fitur
    - _Requirements: 1.3, 1.5, 18.2, 18.8_

- [ ] 21. Checkpoint akhir
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tugas bertanda `*` bersifat opsional dan dapat dilewati untuk MVP lebih cepat. Pada Hari 12, tugas stretch 17.2 dan 17.3 dapat di-descope tanpa memengaruhi deliverable lain.
- Langkah non-kode (deploy manual, tangkapan layar, rekam video, upload, submit, uji manual lintas-browser) hanya direpresentasikan sebagai berkas checklist di `docs/`. Pelaksanaannya dilakukan pemilik repositori.
- Tugas Hari 3 merujuk `.kiro/specs/vault-visual-drama-tactile-feedback/tasks.md` dan tidak menyalin isinya. Tugas bertanda `*` di spec itu mengikuti penandaannya sendiri.
- Bila suatu fase tidak selesai pada hari terakhirnya, catat `carried-over` ke hari 15 atau keputusan descope (Req 1.5).
- Tes dengan PBKDF2 memakai `numRuns` 10 sampai 20 dengan `testTimeout` 30 detik; iterasi 310 000 tidak dikurangi.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "1.5", "1.6", "2.1", "4.1", "6.1", "7.1", "8.1", "11.1", "12.1", "12.3", "14.1", "14.4", "17.1"] },
    { "id": 1, "tasks": ["1.2", "1.4", "2.2", "2.3", "2.4", "2.5", "4.2", "6.2", "7.2", "7.3", "8.2", "8.3", "11.2", "11.3", "12.2", "14.2", "14.5", "14.6", "17.4"] },
    { "id": 2, "tasks": ["2.6", "4.3", "8.4", "8.5", "8.6", "8.8", "9.1", "11.4"] },
    { "id": 3, "tasks": ["4.4", "6.3", "8.7", "9.2", "11.5"] },
    { "id": 4, "tasks": ["6.4", "6.5", "6.6", "9.3", "9.4", "9.5", "9.6", "9.7", "9.8", "9.9", "11.6", "14.7"] },
    { "id": 5, "tasks": ["7.4", "14.3", "14.8", "15.1", "15.4"] },
    { "id": 6, "tasks": ["15.2", "15.3", "15.5", "15.6", "17.2"] },
    { "id": 7, "tasks": ["17.3", "18.1", "18.2", "18.3", "18.4", "18.5", "18.6", "18.7"] },
    { "id": 8, "tasks": ["19.1"] },
    { "id": 9, "tasks": ["19.2"] },
    { "id": 10, "tasks": ["20.1"] }
  ]
}
```
