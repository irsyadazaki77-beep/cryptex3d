import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  InvalidWavError,
  MIN_DRONE_SECONDS,
  WAV_HEADER_BYTES,
  WAV_SAMPLE_RATE,
  buildWav,
  embedInWav,
  extractFromWav,
  parseWav,
  samplesForPayload,
  synthesizeCarrierFor,
  synthesizeCrystalDrone,
} from '../../src/core/stego/audioStego';
import {
  BadMagicError,
  CarrierCapacityError,
  ChecksumFailError,
  PayloadTooLargeError,
} from '../../src/core/stego/BitstreamLayout';
import { handleStegoMessage } from '../../src/core/stego/StegoWorker';

const payloadArb = fc.uint8Array({ minLength: 0, maxLength: 2_000 });

describe('WAV container', () => {
  it('builds a canonical mono 16-bit PCM header', () => {
    const wav = buildWav(new Int16Array([1, -1, 300]));
    const info = parseWav(wav);
    expect(info).toEqual({ dataOffset: WAV_HEADER_BYTES, sampleCount: 3, sampleRate: WAV_SAMPLE_RATE, channels: 1 });
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe('WAVE');
  });

  it('rejects non-WAV, non-PCM and truncated input', () => {
    expect(() => parseWav(new Uint8Array(10))).toThrow(InvalidWavError);
    expect(() => parseWav(new Uint8Array(64))).toThrow(InvalidWavError);
    const wav = buildWav(new Int16Array(10));
    wav[20] = 3; // IEEE float, not PCM
    expect(() => parseWav(wav)).toThrow(InvalidWavError);
  });
});

describe('crystal drone synthesis', () => {
  it('is at least the minimum length and uses real signal amplitude', () => {
    const wav = synthesizeCarrierFor(10);
    const info = parseWav(wav);
    expect(info.sampleCount).toBeGreaterThanOrEqual(MIN_DRONE_SECONDS * WAV_SAMPLE_RATE);
    const s = new Int16Array(wav.buffer, wav.byteOffset + WAV_HEADER_BYTES, info.sampleCount);
    let peak = 0;
    for (const v of s) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeGreaterThan(3000);
    expect(peak).toBeLessThan(20000);
  });

  it('grows to fit a large payload', () => {
    const wav = synthesizeCarrierFor(60_000);
    expect(parseWav(wav).sampleCount).toBeGreaterThanOrEqual(samplesForPayload(60_000));
  });

  it('has uniformly random LSBs before embedding (dither), so embedding is not a statistical tell', () => {
    const samples = synthesizeCrystalDrone(120_000);
    let ones = 0;
    for (const v of samples) ones += v & 1;
    const ratio = ones / samples.length;
    // sd of a fair coin over 120k trials is ~0.0014; +/-0.02 is >14 sd.
    expect(ratio).toBeGreaterThan(0.48);
    expect(ratio).toBeLessThan(0.52);
  });
});

describe('LSB embed / extract in WAV', () => {
  it('round-trips any payload', () => {
    fc.assert(
      fc.property(payloadArb, (payload) => {
        const carrier = synthesizeCarrierFor(payload.length);
        const stego = embedInWav(carrier, payload);
        expect(extractFromWav(stego)).toEqual(payload);
      }),
      { numRuns: 40 },
    );
  });

  it('changes only the LSB of sample low bytes: header and high bytes are untouched', () => {
    const payload = new Uint8Array(500).map((_, i) => (i * 7) & 255);
    const carrier = synthesizeCarrierFor(payload.length);
    const stego = embedInWav(carrier, payload);
    expect(stego.length).toBe(carrier.length);
    expect(stego.slice(0, WAV_HEADER_BYTES)).toEqual(carrier.slice(0, WAV_HEADER_BYTES));
    for (let i = WAV_HEADER_BYTES; i < carrier.length; i++) {
      const diff = stego[i] ^ carrier[i];
      if ((i - WAV_HEADER_BYTES) % 2 === 1) expect(diff).toBe(0); // high byte
      else expect(diff & 0xfe).toBe(0); // low byte: at most bit 0
    }
  });

  it('never mutates the carrier it is given', () => {
    const carrier = synthesizeCarrierFor(32);
    const copy = carrier.slice();
    embedInWav(carrier, new Uint8Array(32).fill(255));
    expect(carrier).toEqual(copy);
  });

  it('a perturbation of at most one LSB per sample cannot be heard (max error 1/32768)', () => {
    const carrier = synthesizeCarrierFor(1000);
    const stego = embedInWav(carrier, new Uint8Array(1000).fill(0xaa));
    const a = new Int16Array(carrier.buffer.slice(WAV_HEADER_BYTES));
    const b = new Int16Array(stego.buffer.slice(WAV_HEADER_BYTES));
    let maxErr = 0;
    for (let i = 0; i < a.length; i++) maxErr = Math.max(maxErr, Math.abs(a[i] - b[i]));
    expect(maxErr).toBeLessThanOrEqual(1);
  });

  it('reports typed errors for no payload, corruption and capacity', () => {
    const plain = synthesizeCarrierFor(8);
    expect(() => extractFromWav(plain)).toThrow(BadMagicError);

    const stego = embedInWav(plain, new Uint8Array(64).fill(1));
    const corrupt = stego.slice();
    // Flip a payload bit (LSB of a sample well inside the payload region).
    corrupt[WAV_HEADER_BYTES + 2 * 200] ^= 1;
    expect(() => extractFromWav(corrupt)).toThrow(ChecksumFailError);

    const tiny = buildWav(new Int16Array(100));
    expect(() => embedInWav(tiny, new Uint8Array(64))).toThrow(CarrierCapacityError);
    expect(() => embedInWav(plain, new Uint8Array(256_001))).toThrow(PayloadTooLargeError);
  });
});

describe('stego worker audio ops', () => {
  it('embedAudio then extractAudio round-trips a shard record', async () => {
    const record = new Uint8Array(3000).map((_, i) => (i * 13) & 255);
    const emb = await handleStegoMessage({
      kind: 'request',
      id: 'a',
      target: 'stego',
      op: 'embedAudio',
      payload: { record },
    });
    expect(emb.kind).toBe('response');
    const wav = (emb as { payload: { wav: Uint8Array } }).payload.wav;
    const ext = await handleStegoMessage({
      kind: 'request',
      id: 'b',
      target: 'stego',
      op: 'extractAudio',
      payload: { wav },
    });
    expect((ext as { payload: { record: Uint8Array } }).payload.record).toEqual(record);
  });

  it('maps a non-WAV file to INVALID_INPUT and an unmarked WAV to BAD_MAGIC', async () => {
    const bad = await handleStegoMessage({
      kind: 'request',
      id: 'c',
      target: 'stego',
      op: 'extractAudio',
      payload: { wav: new Uint8Array(100) },
    });
    expect(bad).toMatchObject({ kind: 'error', code: 'INVALID_INPUT' });
    const none = await handleStegoMessage({
      kind: 'request',
      id: 'd',
      target: 'stego',
      op: 'extractAudio',
      payload: { wav: synthesizeCarrierFor(8) },
    });
    expect(none).toMatchObject({ kind: 'error', code: 'BAD_MAGIC' });
  });
});
