/**
 * CryptexRing: 8 concentric hollow cylinder segments. Clicking a segment advances its
 * position (0-9) and rotates it by 36 degrees. A segment that settles into place emits an
 * emerald lock-in pulse; aligning all segments pulses the whole ring. The ring levitates
 * gently and glows on hover. No React and no store imports.
 */
import * as THREE from 'three';
import type { ArtifactFactory } from '../sceneRegistry';
import { getArtifactState } from '../artifactState';
import { RING_SEGMENT_COUNT } from '../SpatialKeySerializer';
import { onSceneEffect } from '../sceneBridge';
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

/** Pure: true when every segment shows the same position (the ring "locks in"). */
export function isRingAligned(positions: readonly number[]): boolean {
  return positions.length > 0 && positions.every((p) => p === positions[0]);
}

/** Pure: linear decay of a 0..1 pulse over durationMs. */
export function decayPulse(pulse: number, deltaMs: number, durationMs: number): number {
  if (pulse <= 0) return 0;
  return Math.max(0, pulse - Math.max(0, deltaMs) / durationMs);
}

const BASE_RADIUS = 0.6;
const RADIUS_STEP = 0.14;
const SEGMENT_HEIGHT = 0.36;
const RING_CENTER = new THREE.Vector3(3.4, 0, 0);
/** Radians per second used to ease toward the target angle. */
const EASE_RATE = 10;
const SEGMENT_BASE_EMISSIVE = 0.15;
const SEGMENT_HOVER_EMISSIVE = 0.45;
const SEGMENT_PULSE_EMISSIVE = 2.2;
const MARKER_BASE_EMISSIVE = 2.2; // above the bloom threshold: markers always glow softly
const PULSE_MS = 700;
const ALIGNED_PULSE_MS = 1400;
const HOVER_EASE_MS = 200;
const LEVITATION_AMPLITUDE = 0.06;
const INDIGO = new THREE.Color(0x6366f1);
const EMERALD = new THREE.Color(0x10b981);

export const createCryptexRing: ArtifactFactory = (ctx) => {
  const { registry } = ctx;
  const state = getArtifactState(registry.events);
  const group = new THREE.Group();
  group.name = 'cryptex-ring';
  group.position.copy(RING_CENTER);
  group.rotation.x = Math.PI / 2 - 0.5; // tilt so the dial faces the camera
  const positions: number[] = new Array<number>(RING_SEGMENT_COUNT).fill(0);
  const current: number[] = new Array<number>(RING_SEGMENT_COUNT).fill(0); // radians
  const moving: boolean[] = new Array<boolean>(RING_SEGMENT_COUNT).fill(false);
  const pulse: number[] = new Array<number>(RING_SEGMENT_COUNT).fill(0);
  const segments: THREE.Mesh[] = [];
  const materials: THREE.MeshStandardMaterial[] = [];
  const markerGeometry = new THREE.BoxGeometry(0.05, SEGMENT_HEIGHT * 1.02, 0.05);
  const markerMaterial = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x10b981,
    emissiveIntensity: MARKER_BASE_EMISSIVE,
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
      emissiveIntensity: SEGMENT_BASE_EMISSIVE,
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
    materials.push(material);
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

  let hovered = false;
  let hoverProgress = 0;
  let alignedPulse = 0;

  const interaction: ArtifactInteraction = {
    id: 'ring',
    object: group,
    onPointerEnter() {
      hovered = true;
    },
    onPointerLeave() {
      hovered = false;
    },
    onClick(hit) {
      const index = segmentIndexOf(hit.object);
      if (index === null || index < 0 || index >= RING_SEGMENT_COUNT) return;
      positions[index] = advanceSegment(positions[index]);
      moving[index] = true;
      if (isRingAligned(positions)) alignedPulse = 1;
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
  // Sealing a ring-bound token makes the whole ring pulse, as if it locked in.
  const stopEffects = onSceneEffect((effect) => {
    if (effect === 'ring-seal') alignedPulse = 1;
  });

  const stopFrame = registry.onFrame((deltaMs, timeMs) => {
    const k = 1 - Math.exp(-EASE_RATE * (deltaMs / 1000));
    alignedPulse = decayPulse(alignedPulse, deltaMs, ALIGNED_PULSE_MS);
    const hoverStep = deltaMs / HOVER_EASE_MS;
    hoverProgress = Math.min(1, Math.max(0, hoverProgress + (hovered ? hoverStep : -hoverStep)));
    for (let i = 0; i < RING_SEGMENT_COUNT; i++) {
      const target = THREE.MathUtils.degToRad(positions[i] * RING_STEP_DEGREES);
      // Shortest path so the 9 -> 0 wrap rotates forward one step.
      let diff = target - current[i];
      diff = ((((diff + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
      if (Math.abs(diff) < 1e-4) {
        current[i] = target;
        if (moving[i]) {
          moving[i] = false;
          pulse[i] = 1; // lock-in pulse when the segment settles
        }
      } else {
        current[i] += diff * k;
      }
      segments[i].rotation.y = current[i];
      pulse[i] = Math.max(decayPulse(pulse[i], deltaMs, PULSE_MS), alignedPulse);
      const m = materials[i];
      const rest = SEGMENT_BASE_EMISSIVE + (SEGMENT_HOVER_EMISSIVE - SEGMENT_BASE_EMISSIVE) * hoverProgress;
      m.emissiveIntensity = rest + (SEGMENT_PULSE_EMISSIVE - rest) * pulse[i];
      m.emissive.lerpColors(INDIGO, EMERALD, pulse[i]);
    }
    markerMaterial.emissiveIntensity = MARKER_BASE_EMISSIVE + alignedPulse * 2.5;
    // Idle levitation.
    group.position.y = RING_CENTER.y + Math.sin(timeMs / 1500) * LEVITATION_AMPLITUDE;
  });
  state.setRingSegments(positions);
  state.emit(registry.events);
  return () => {
    stopFrame();
    stopEffects();
    unregisterInteraction();
    removeObject();
  };
};
