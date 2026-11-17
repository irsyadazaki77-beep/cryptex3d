/**
 * Secure-ish buffer wiping. JavaScript cannot guarantee that no other copy of the bytes
 * exists (structured clones sent to workers, GPU uploads, GC moves), so this overwrites the
 * buffer the app itself holds. It never logs or inspects the content. No React, no Three.js.
 */
/** `crypto.getRandomValues` accepts at most 65 536 bytes per call. */
const RANDOM_CHUNK = 65_536;

/** Overwrites `buf` in place with cryptographically random bytes. */
export function overwriteWithRandom(buf: Uint8Array | Uint8ClampedArray): void {
  for (let off = 0; off < buf.length; off += RANDOM_CHUNK) {
    // Typed as ArrayBuffer-backed: these buffers are never SharedArrayBuffer-backed in this app.
    const chunk = buf.subarray(off, Math.min(off + RANDOM_CHUNK, buf.length)) as unknown as Uint8Array<ArrayBuffer>;
    crypto.getRandomValues(chunk);
  }
}

/** Returns `n` cryptographically random bytes (chunked for the 65 536-byte quota). */
export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  overwriteWithRandom(out);
  return out;
}
