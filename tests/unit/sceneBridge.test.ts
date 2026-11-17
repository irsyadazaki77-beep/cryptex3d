import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fireSceneEffect,
  getCarrierPreview,
  getCarrierPreviewVersion,
  getCrystalResonance,
  getGlitchLevel,
  getSceneBridgeVersion,
  getXrayLens,
  onSceneEffect,
  resetSceneBridge,
  setCarrierPreview,
  setCrystalResonance,
  setGlitchLevel,
  setXrayLens,
  subscribeSceneBridge,
} from '../../src/scene/sceneBridge';

const preview = (fill: number) => ({
  pixels: new Uint8ClampedArray(64).fill(fill),
  width: 4,
  height: 4,
  payloadBits: 24,
});

describe('sceneBridge', () => {
  beforeEach(() => resetSceneBridge());

  it('toggles the X-Ray lens and notifies subscribers once per real change', () => {
    const listener = vi.fn();
    const off = subscribeSceneBridge(listener);
    expect(getXrayLens()).toBe(false);
    setXrayLens(true);
    setXrayLens(true); // no-op
    expect(getXrayLens()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getSceneBridgeVersion()).toBe(1);
    off();
    setXrayLens(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('wipes the previous preview pixels when it is replaced or cleared', () => {
    const first = preview(200);
    setCarrierPreview(first);
    expect(getCarrierPreview()).toBe(first);
    const v1 = getCarrierPreviewVersion();
    const second = preview(10);
    setCarrierPreview(second);
    expect(first.pixels.some((b) => b !== 200)).toBe(true); // overwritten
    expect(second.pixels.every((b) => b === 10)).toBe(true);
    expect(getCarrierPreviewVersion()).toBeGreaterThan(v1);
    setCarrierPreview(null);
    expect(second.pixels.some((b) => b !== 10)).toBe(true);
    expect(getCarrierPreview()).toBeNull();
  });

  it('delivers scene effects to listeners until they unsubscribe', () => {
    const seen: string[] = [];
    const off = onSceneEffect((e) => seen.push(e));
    fireSceneEffect('shatter');
    fireSceneEffect('ring-seal');
    off();
    fireSceneEffect('shatter');
    expect(seen).toEqual(['shatter', 'ring-seal']);
  });

  it('tracks resonance and glitch level', () => {
    setCrystalResonance(true);
    setGlitchLevel(0.7);
    expect(getCrystalResonance()).toBe(true);
    expect(getGlitchLevel()).toBe(0.7);
    resetSceneBridge();
    expect(getCrystalResonance()).toBe(false);
    expect(getGlitchLevel()).toBe(0);
  });
});
