/**
 * Thin wrapper over three's OrbitControls with enable()/disable()/dispose().
 * No React and no store imports.
 */
import type * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface OrbitToggle {
  enable(): void;
  disable(): void;
}

export class OrbitControlsWrapper implements OrbitToggle {
  private readonly controls: OrbitControls;
  private disposed = false;

  constructor(camera: THREE.Camera, domElement: HTMLElement) {
    this.controls = new OrbitControls(camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 20;
  }

  get enabled(): boolean {
    return this.controls.enabled;
  }

  enable(): void {
    if (!this.disposed) this.controls.enabled = true;
  }

  disable(): void {
    if (!this.disposed) this.controls.enabled = false;
  }

  /** Call once per frame (damping requires it). */
  update(): void {
    if (!this.disposed) this.controls.update();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.controls.dispose();
  }
}
