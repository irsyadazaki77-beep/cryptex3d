/**
 * ShatterEffect: the visual half of the Tamper Tripwire / self-destruct.
 *
 * On a 'shatter' scene effect, ~200 crimson shards burst outward from the three artifacts
 * (Monolith, Crystal, Ring) and fall under gravity, a red light flashes, and a glitch level
 * (read by the compositor's RGB-split pass and the carrier face) spikes and decays. It is a
 * pure overlay: it never moves or rotates the artifacts, so the Spatial Key is untouched.
 *
 * Everything is preallocated: one InstancedMesh, one geometry, one material, one light. While
 * idle the mesh is hidden and the frame callback returns immediately. No React, no store.
 */
import * as THREE from 'three';
import type { ArtifactFactory } from '../sceneRegistry';
import { PEDESTAL_X } from '../environment';
import { onSceneEffect, setGlitchLevel } from '../sceneBridge';

export const SHARD_COUNT = 210;
export const SHATTER_DURATION_MS = 2400;
const GRAVITY = -5.5;
const ORIGIN_Y = [0.1, 0.65, 0.2]; // monolith centre, crystal centre, ring centre
const FLASH_PEAK = 90;

/** Pure: glitch intensity (0..1) at time `t` into the effect. Sharp spike, then a flickering decay. */
export function glitchEnvelope(tMs: number, durationMs: number = SHATTER_DURATION_MS): number {
  if (tMs < 0 || tMs >= durationMs) return 0;
  const x = tMs / durationMs;
  const spike = Math.exp(-x * 4.2);
  const flicker = 0.75 + 0.25 * Math.sin(tMs / 23);
  return Math.min(1, spike * flicker * 1.15);
}

/** Pure: shard opacity/scale factor at time `t` (full until 55 %, then fades out). */
export function shardLife(tMs: number, durationMs: number = SHATTER_DURATION_MS): number {
  const x = tMs / durationMs;
  if (x >= 1) return 0;
  if (x <= 0.55) return 1;
  return Math.max(0, 1 - (x - 0.55) / 0.45);
}

export const createShatterEffect: ArtifactFactory = (ctx) => {
  const { registry } = ctx;

  const geometry = new THREE.TetrahedronGeometry(0.1, 0);
  // HDR colour (> 1) so the shards cross the bloom threshold and glow.
  const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.22, 0.3), fog: false });
  const shards = new THREE.InstancedMesh(geometry, material, SHARD_COUNT);
  shards.name = 'shatter-shards';
  shards.visible = false;
  shards.frustumCulled = false;
  shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const flash = new THREE.PointLight(0xff2244, 0, 14, 2);
  flash.position.set(0, 1.5, 3);
  registry.add(shards, geometry, material);
  registry.add(flash);

  const origin = new Float32Array(SHARD_COUNT * 3);
  const velocity = new Float32Array(SHARD_COUNT * 3);
  const spin = new Float32Array(SHARD_COUNT * 3);
  const size = new Float32Array(SHARD_COUNT);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  let elapsed = -1; // < 0 = idle

  const randomise = (): void => {
    // Visual randomness only; nothing here is security-relevant.
    for (let i = 0; i < SHARD_COUNT; i++) {
      const slot = i % 3;
      origin[i * 3] = PEDESTAL_X[slot] + (Math.random() - 0.5) * 0.9;
      origin[i * 3 + 1] = ORIGIN_Y[slot] + (Math.random() - 0.5) * 1.6;
      origin[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
      const theta = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 4.5;
      velocity[i * 3] = Math.cos(theta) * speed;
      velocity[i * 3 + 1] = 1.2 + Math.random() * 4.2;
      velocity[i * 3 + 2] = Math.sin(theta) * speed * 0.6 + 1.2;
      spin[i * 3] = (Math.random() - 0.5) * 14;
      spin[i * 3 + 1] = (Math.random() - 0.5) * 14;
      spin[i * 3 + 2] = (Math.random() - 0.5) * 14;
      size[i] = 0.6 + Math.random() * 1.4;
    }
  };

  const stopListening = onSceneEffect((effect) => {
    if (effect !== 'shatter') return;
    randomise();
    elapsed = 0;
    shards.visible = true;
  });

  const stopFrame = registry.onFrame((deltaMs) => {
    if (elapsed < 0) return;
    elapsed += deltaMs;
    if (elapsed >= SHATTER_DURATION_MS) {
      elapsed = -1;
      shards.visible = false;
      flash.intensity = 0;
      setGlitchLevel(0);
      return;
    }
    const t = elapsed / 1000;
    const life = shardLife(elapsed);
    for (let i = 0; i < SHARD_COUNT; i++) {
      pos.set(
        origin[i * 3] + velocity[i * 3] * t,
        origin[i * 3 + 1] + velocity[i * 3 + 1] * t + 0.5 * GRAVITY * t * t,
        origin[i * 3 + 2] + velocity[i * 3 + 2] * t,
      );
      e.set(spin[i * 3] * t, spin[i * 3 + 1] * t, spin[i * 3 + 2] * t);
      q.setFromEuler(e);
      scale.setScalar(size[i] * life);
      m.compose(pos, q, scale);
      shards.setMatrixAt(i, m);
    }
    shards.instanceMatrix.needsUpdate = true;
    flash.intensity = FLASH_PEAK * Math.exp(-elapsed / 260);
    setGlitchLevel(glitchEnvelope(elapsed));
  });

  return () => {
    stopListening();
    stopFrame();
    setGlitchLevel(0);
    shards.dispose();
    geometry.dispose();
    material.dispose();
  };
};

export default createShatterEffect;
