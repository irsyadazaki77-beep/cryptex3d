/**
 * EtherealCrystal artifact: icosahedron with a transmissive, emissive physical material.
 * Hover ramps emissiveIntensity over 300 ms and sets crystalActivated via the shared
 * artifact state emit (the SpatialKeySerializer writes the store). No React, no store imports.
 */
import * as THREE from 'three';
import type { ArtifactFactory } from '../sceneRegistry';
import { getArtifactState } from '../artifactState';
import type { ArtifactInteraction } from './types';

export const CRYSTAL_GLOW_DURATION_MS = 300;
export const CRYSTAL_EMISSIVE_MIN = 0.15;
export const CRYSTAL_EMISSIVE_MAX = 2.0;

/**
 * Advance glow progress (0..1) toward the target by deltaMs over durationMs.
 * Pure: result is clamped to [0, 1].
 */
export function advanceGlowProgress(
  progress: number,
  hovered: boolean,
  deltaMs: number,
  durationMs: number = CRYSTAL_GLOW_DURATION_MS,
): number {
  const step = durationMs > 0 ? Math.max(0, deltaMs) / durationMs : 1;
  const next = hovered ? progress + step : progress - step;
  return Math.min(1, Math.max(0, next));
}

/** Map glow progress (0..1) to an emissiveIntensity value. */
export function glowIntensity(
  progress: number,
  min: number = CRYSTAL_EMISSIVE_MIN,
  max: number = CRYSTAL_EMISSIVE_MAX,
): number {
  const p = Math.min(1, Math.max(0, progress));
  return min + (max - min) * p;
}

export const createEtherealCrystal: ArtifactFactory = (ctx) => {
  const { registry } = ctx;

  const geometry = new THREE.IcosahedronGeometry(0.8, 1);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x99a8ff,
    transmission: 0.9,
    thickness: 0.8,
    roughness: 0.1,
    ior: 1.5,
    metalness: 0,
    emissive: new THREE.Color(0x6366f1),
    emissiveIntensity: CRYSTAL_EMISSIVE_MIN,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'ethereal-crystal';
  mesh.position.set(0, 0.5, 0);

  const removeFromScene = registry.add(mesh, geometry, material);

  const state = getArtifactState(registry.events);
  let hovered = false;
  let progress = 0;

  const setActivated = (v: boolean): void => {
    if (state.getDetail().crystalActivated === v) return;
    state.setCrystalActivated(v);
    state.emit(registry.events);
  };

  const interaction: ArtifactInteraction = {
    id: 'crystal',
    object: mesh,
    onPointerEnter() {
      hovered = true;
      setActivated(true);
    },
    onPointerLeave() {
      hovered = false;
      setActivated(false);
    },
  };
  const removeInteraction = registry.registerInteraction(interaction);

  const removeFrame = registry.onFrame((deltaMs) => {
    mesh.rotation.y += deltaMs * 0.0004;
    const next = advanceGlowProgress(progress, hovered, deltaMs);
    if (next !== progress) {
      progress = next;
      material.emissiveIntensity = glowIntensity(progress);
    }
  });

  return () => {
    removeFrame();
    removeInteraction();
    removeFromScene();
    geometry.dispose();
    material.dispose();
  };
};
