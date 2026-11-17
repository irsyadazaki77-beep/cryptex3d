/**
 * ObsidianMonolith: beveled dark slab. Drag rotates it; each move emits the full
 * artifact state (monolith rotation in degrees) on registry.events.
 */
import * as THREE from 'three';
import type { ArtifactFactory } from '../sceneRegistry';
import { getArtifactState } from '../artifactState';
import type { ArtifactInteraction, ArtifactPointerEvent } from './types';

const WIDTH = 1.2;
const HEIGHT = 2.6;
const DEPTH = 0.5;
const BEVEL = 0.07;
const ROTATE_SPEED = 0.008; // radians per pixel
const RAD_TO_DEG = 180 / Math.PI;
const TWO_PI = Math.PI * 2;

function wrapRad(r: number): number {
  const m = r % TWO_PI;
  return m < 0 ? m + TWO_PI : m;
}

function buildGeometry(): THREE.BufferGeometry {
  const w = WIDTH - BEVEL * 2;
  const h = HEIGHT - BEVEL * 2;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, -h / 2);
  shape.lineTo(w / 2, -h / 2);
  shape.lineTo(w / 2, h / 2);
  shape.lineTo(-w / 2, h / 2);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: DEPTH - BEVEL * 2,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 3,
    steps: 1,
  });
  geo.translate(0, 0, -(DEPTH - BEVEL * 2) / 2);
  geo.computeVertexNormals();
  return geo;
}

export const createObsidianMonolith: ArtifactFactory = (ctx) => {
  const { registry } = ctx;
  const geometry = buildGeometry();
  const material = new THREE.MeshStandardMaterial({
    color: 0x0a0b12,
    roughness: 0.1,
    metalness: 0.9,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'ObsidianMonolith';
  mesh.position.set(-3.6, 0, 0);
  mesh.rotation.order = 'XYZ'; // internal Euler stays in radians

  const state = getArtifactState(registry.events);
  const emit = (): void => {
    state.setMonolithRot([
      wrapRad(mesh.rotation.x) * RAD_TO_DEG,
      wrapRad(mesh.rotation.y) * RAD_TO_DEG,
      wrapRad(mesh.rotation.z) * RAD_TO_DEG,
    ]);
    state.emit(registry.events);
  };

  let dragging = false;

  const interaction: ArtifactInteraction = {
    id: 'monolith',
    object: mesh,
    onPointerDown(): void {
      dragging = true;
    },
    onPointerMove(e: ArtifactPointerEvent): void {
      if (!dragging) return;
      mesh.rotation.y += e.movementX * ROTATE_SPEED;
      mesh.rotation.x += e.movementY * ROTATE_SPEED;
      mesh.rotation.x = wrapRad(mesh.rotation.x);
      mesh.rotation.y = wrapRad(mesh.rotation.y);
      emit();
    },
    onPointerUp(): void {
      dragging = false;
    },
  };

  const removeFromScene = registry.add(mesh, geometry, material);
  const unregister = registry.registerInteraction(interaction);

  // Publish initial state so the serializer has a snapshot before any interaction.
  emit();

  return () => {
    dragging = false;
    unregister();
    removeFromScene();
    geometry.dispose();
    material.dispose();
  };
};

export default createObsidianMonolith;
