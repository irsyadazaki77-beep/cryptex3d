/**
 * CryptexRing: 8 concentric hollow cylinder segments. Clicking a segment advances its
 * position (0-9) and rotates it by 36 degrees. No React and no store imports.
 */
import * as THREE from 'three';
import type { ArtifactFactory } from '../sceneRegistry';
import { getArtifactState } from '../artifactState';
import { RING_SEGMENT_COUNT } from '../SpatialKeySerializer';
import type { ArtifactInteraction } from './types';

export const RING_POSITIONS = 10;
export const RING_STEP_DEGREES = 36;
export const RING_SEGMENT_ROTATED_EVENT = 'ring-segment-rotated';

export interface RingSegmentRotatedDetail {
  index: number;
  position: number;
}

/** Pure: next position on a 10-position dial. */
export function advanceSegment(pos: number): number {
  return (pos + 1) % RING_POSITIONS;
}

const BASE_RADIUS = 0.6;
const RADIUS_STEP = 0.14;
const SEGMENT_HEIGHT = 0.36;
const RING_CENTER = new THREE.Vector3(3.4, 0, 0);
/** Radians per second used to ease toward the target angle. */
const EASE_RATE = 10;

export const createCryptexRing: ArtifactFactory = (ctx) => {
  const { registry } = ctx;
  const state = getArtifactState(registry.events);

  const group = new THREE.Group();
  group.name = 'cryptex-ring';
  group.position.copy(RING_CENTER);
  group.rotation.x = Math.PI / 2 - 0.5; // tilt so the dial faces the camera

  const positions: number[] = new Array<number>(RING_SEGMENT_COUNT).fill(0);
  const current: number[] = new Array<number>(RING_SEGMENT_COUNT).fill(0); // radians
  const segments: THREE.Mesh[] = [];

  const markerGeometry = new THREE.BoxGeometry(0.05, SEGMENT_HEIGHT * 1.02, 0.05);
  const markerMaterial = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x10b981,
    emissiveIntensity: 0.6,
  });
  registry.registerDisposable(markerGeometry);
  registry.registerDisposable(markerMaterial);

  for (let i = 0; i < RING_SEGMENT_COUNT; i++) {
    const radius = BASE_RADIUS + i * RADIUS_STEP;
    const geometry = new THREE.CylinderGeometry(radius, radius, SEGMENT_HEIGHT, 48, 1, true);
    const material = new THREE.MeshStandardMaterial({
      color: 0x1e2440,
      metalness: 0.8,
      roughness: 0.35,
      side: THREE.DoubleSide,
      emissive: 0x6366f1,
      emissiveIntensity: 0.15,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `ring-segment-${i}`;
    mesh.userData.segmentIndex = i;
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.position.set(0, 0, radius);
    marker.userData.segmentIndex = i;
    mesh.add(marker);
    group.add(mesh);
    segments.push(mesh);
    registry.registerDisposable(geometry);
    registry.registerDisposable(material);
  }

  const removeObject = registry.add(group);

  const segmentIndexOf = (obj: THREE.Object3D | null): number | null => {
    let o: THREE.Object3D | null = obj;
    while (o) {
      const idx = o.userData.segmentIndex as unknown;
      if (typeof idx === 'number') return idx;
      o = o.parent;
    }
    return null;
  };

  const interaction: ArtifactInteraction = {
    id: 'ring',
    object: group,
    onClick(hit) {
      const index = segmentIndexOf(hit.object);
      if (index === null || index < 0 || index >= RING_SEGMENT_COUNT) return;
      positions[index] = advanceSegment(positions[index]);
      state.setRingSegments(positions);
      state.emit(registry.events);
      registry.events.dispatchEvent(
        new CustomEvent<RingSegmentRotatedDetail>(RING_SEGMENT_ROTATED_EVENT, {
          detail: { index, position: positions[index] },
        }),
      );
    },
  };
  const unregisterInteraction = registry.registerInteraction(interaction);

  const stopFrame = registry.onFrame((deltaMs) => {
    const k = 1 - Math.exp(-EASE_RATE * (deltaMs / 1000));
    for (let i = 0; i < RING_SEGMENT_COUNT; i++) {
      const target = THREE.MathUtils.degToRad(positions[i] * RING_STEP_DEGREES);
      // Shortest path so the 9 -> 0 wrap rotates forward one step.
      let diff = target - current[i];
      diff = ((((diff + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
      current[i] = Math.abs(diff) < 1e-4 ? target : current[i] + diff * k;
      segments[i].rotation.y = current[i];
    }
  });

  state.setRingSegments(positions);
  state.emit(registry.events);

  return () => {
    stopFrame();
    unregisterInteraction();
    removeObject();
  };
};
