import type * as THREE from 'three';

export interface ArtifactPointerEvent {
  clientX: number;
  clientY: number;
  movementX: number;
  movementY: number;
}

export interface ArtifactInteraction {
  readonly id: 'monolith' | 'ring' | 'crystal';
  readonly object: THREE.Object3D;
  onPointerDown?(e: ArtifactPointerEvent): void;
  onPointerMove?(e: ArtifactPointerEvent): void;
  onPointerUp?(e: ArtifactPointerEvent): void;
  onPointerEnter?(): void;
  onPointerLeave?(): void;
  onClick?(hit: THREE.Intersection): void;
}
