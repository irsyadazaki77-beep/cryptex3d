/**
 * Haunted Cyber-Vault environment: reflective-dark pedestals, a glowing rune floor grid,
 * and ambient dust. Every geometry/material is handed to the registry for disposal.
 * Emissive colours use HDR values (> 1) so only they cross the bloom threshold.
 * No React and no store imports.
 */
import * as THREE from 'three';
import type { SceneRegistry } from './sceneRegistry';

export const FLOOR_Y = -1.5;
/** X centres under the monolith, crystal and ring (see artifact factories). */
export const PEDESTAL_X: readonly number[] = [-3.6, 0, 3.4];
const PEDESTAL_RADIUS = 1.4;
const PEDESTAL_HEIGHT = 0.15;
const GLYPHS_PER_PEDESTAL = 28;
const DUST_COUNT = 280;
/** Radians per millisecond (~one revolution every 7 minutes). */
const DUST_DRIFT_PER_MS = 0.000015;

/** Seeded LCG so visuals are identical across loads (not security-relevant). */
function makeRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function buildRuneVertices(): Float32Array {
  const rand = makeRand(0x51ee7);
  const v: number[] = [];
  const y = FLOOR_Y + 0.004;
  for (const cx of PEDESTAL_X) {
    for (let g = 0; g < GLYPHS_PER_PEDESTAL; g++) {
      const angle = (g / GLYPHS_PER_PEDESTAL) * Math.PI * 2;
      const r = PEDESTAL_RADIUS + 0.35;
      const gx = cx + Math.cos(angle) * r;
      const gz = Math.sin(angle) * r;
      // Local tangent/radial axes of the glyph cell.
      const tx = -Math.sin(angle);
      const tz = Math.cos(angle);
      const rx = Math.cos(angle);
      const rz = Math.sin(angle);
      const strokes = 2 + Math.floor(rand() * 2);
      for (let s = 0; s < strokes; s++) {
        const a0 = (rand() - 0.5) * 0.16;
        const b0 = (rand() - 0.5) * 0.16;
        const a1 = (rand() - 0.5) * 0.16;
        const b1 = (rand() - 0.5) * 0.16;
        v.push(gx + tx * a0 + rx * b0, y, gz + tz * a0 + rz * b0);
        v.push(gx + tx * a1 + rx * b1, y, gz + tz * a1 + rz * b1);
      }
    }
  }
  return new Float32Array(v);
}

export interface VaultEnvironment {
  /** Per-frame update; `activity` is 0..1 (pipeline running). Cheap: colour writes only. */
  update(deltaMs: number, timeMs: number, activity: number): void;
}

export function createVaultEnvironment(registry: SceneRegistry): VaultEnvironment {
  // Floor grid.
  const grid = new THREE.GridHelper(48, 48, 0x4f46e5, 0x1e1b4b);
  grid.position.y = FLOOR_Y;
  const gridMaterial = grid.material as THREE.LineBasicMaterial;
  gridMaterial.transparent = true;
  gridMaterial.opacity = 0.45;
  registry.add(grid, grid);

  // Pedestals: dark metal discs with a glowing cyan rim.
  const baseGeometry = new THREE.CylinderGeometry(
    PEDESTAL_RADIUS,
    PEDESTAL_RADIUS + 0.12,
    PEDESTAL_HEIGHT,
    64,
  );
  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0x0b0e1a,
    metalness: 0.3,
    roughness: 0.65,
  });
  const rimGeometry = new THREE.TorusGeometry(PEDESTAL_RADIUS + 0.02, 0.012, 8, 96);
  const rimMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.15, 1.4, 2.0) });
  registry.registerDisposable(baseGeometry);
  registry.registerDisposable(baseMaterial);
  registry.registerDisposable(rimGeometry);
  registry.registerDisposable(rimMaterial);
  for (const x of PEDESTAL_X) {
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.set(x, FLOOR_Y + PEDESTAL_HEIGHT / 2, 0);
    base.name = 'pedestal';
    registry.add(base);
    const rim = new THREE.Mesh(rimGeometry, rimMaterial);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x, FLOOR_Y + PEDESTAL_HEIGHT, 0);
    rim.name = 'pedestal-rim';
    registry.add(rim);
  }

  // Rune glyph strokes around each pedestal.
  const runeGeometry = new THREE.BufferGeometry();
  runeGeometry.setAttribute('position', new THREE.BufferAttribute(buildRuneVertices(), 3));
  const runeBase = new THREE.Color(0.4, 0.55, 1.5);
  const runeMaterial = new THREE.LineBasicMaterial({
    color: runeBase.clone(),
    transparent: true,
    opacity: 0.9,
  });
  const runes = new THREE.LineSegments(runeGeometry, runeMaterial);
  runes.name = 'floor-runes';
  registry.add(runes, runeGeometry, runeMaterial);

  // Ambient dust: static seeded points with a very slow drift.
  const rand = makeRand(0x2f6e2b1);
  const positions = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i++) {
    const u = rand() * 2 - 1;
    const theta = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const r = 12 + rand() * 18;
    positions[i * 3] = r * s * Math.cos(theta);
    positions[i * 3 + 1] = r * u;
    positions[i * 3 + 2] = r * s * Math.sin(theta);
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const dustMaterial = new THREE.PointsMaterial({
    color: 0xa5b4fc,
    size: 0.12,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    fog: false,
  });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  dust.name = 'dust';
  registry.add(dust, dustGeometry, dustMaterial);

  return {
    update(deltaMs, timeMs, activity) {
      dust.rotation.y += deltaMs * DUST_DRIFT_PER_MS;
      const breathe = 0.8 + 0.2 * Math.sin(timeMs / 900);
      runeMaterial.color.copy(runeBase).multiplyScalar(breathe + activity * 0.9);
    },
  };
}
