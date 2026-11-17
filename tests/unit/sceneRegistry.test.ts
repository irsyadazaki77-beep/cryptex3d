import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SceneRegistry } from '../../src/scene/sceneRegistry';
import { configureCarrierTexture } from '../../src/scene/carrierTexture';

describe('SceneRegistry', () => {
  it('disposes geometries, materials, textures and registered disposables once', () => {
    const reg = new SceneRegistry(new THREE.Scene());
    const geo = new THREE.BoxGeometry();
    const tex = new THREE.Texture();
    const mat = new THREE.MeshStandardMaterial({ map: tex });
    const extra = { dispose: vi.fn() };
    const geoSpy = vi.spyOn(geo, 'dispose');
    const matSpy = vi.spyOn(mat, 'dispose');
    const texSpy = vi.spyOn(tex, 'dispose');
    reg.add(new THREE.Mesh(geo, mat), extra);
    reg.disposeAll();
    reg.disposeAll();
    expect(geoSpy).toHaveBeenCalledTimes(1);
    expect(matSpy).toHaveBeenCalledTimes(1);
    expect(texSpy).toHaveBeenCalledTimes(1);
    expect(extra.dispose).toHaveBeenCalledTimes(1);
  });

  it('runs frame callbacks until unregistered', () => {
    const reg = new SceneRegistry(new THREE.Scene());
    const cb = vi.fn();
    const off = reg.onFrame(cb);
    reg.runFrame(16, 100);
    off();
    reg.runFrame(16, 116);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('configureCarrierTexture', () => {
  it('disables colour-space conversion, mipmaps and smoothing', () => {
    const t = configureCarrierTexture(new THREE.Texture());
    expect(t.colorSpace).toBe(THREE.NoColorSpace);
    expect(t.generateMipmaps).toBe(false);
    expect(t.minFilter).toBe(THREE.NearestFilter);
    expect(t.magFilter).toBe(THREE.NearestFilter);
  });
});
