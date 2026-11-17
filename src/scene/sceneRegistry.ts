/**
 * SceneRegistry: lets artifacts (tasks 10.2-10.4) add Object3D instances and register
 * disposables / per-frame callbacks without touching the renderer directly.
 * No React and no store imports.
 */
import * as THREE from 'three';
import type { ArtifactInteraction } from './artifacts/types';

export type Disposable = { dispose(): void };
export type FrameCallback = (deltaMs: number, timeMs: number) => void;
export type Unregister = () => void;

/** Scene-level events dispatched on SceneRegistry.events. */
export const SCENE_READY_EVENT = 'scene-ready';
export const SCENE_FRAME_OVERRUN_EVENT = 'scene-frame-overrun';
export const SCENE_DISPOSED_EVENT = 'scene-disposed';

export interface FrameOverrunDetail {
  durationMs: number;
}

function isDisposable(v: unknown): v is Disposable {
  return typeof v === 'object' && v !== null && typeof (v as Disposable).dispose === 'function';
}

export class SceneRegistry {
  readonly scene: THREE.Scene;
  /** Artifact state events (see ARTIFACT_STATE_EVENT) and scene lifecycle events. */
  readonly events: EventTarget = new EventTarget();

  private readonly disposables = new Set<Disposable>();
  private readonly frameCallbacks = new Set<FrameCallback>();
  private readonly interactions = new Set<ArtifactInteraction>();
  private disposed = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Add an object to the scene. Optionally register extra disposables owned by it. */
  add(object: THREE.Object3D, ...extra: Disposable[]): Unregister {
    this.scene.add(object);
    for (const d of extra) this.disposables.add(d);
    return () => {
      this.scene.remove(object);
    };
  }

  /** Register a GPU resource (geometry, material, texture, render target) for disposal. */
  registerDisposable(d: Disposable): Unregister {
    this.disposables.add(d);
    return () => {
      this.disposables.delete(d);
    };
  }

  /** Register a callback run once per frame inside the rAF loop. Must not call React setters. */
  onFrame(cb: FrameCallback): Unregister {
    this.frameCallbacks.add(cb);
    return () => {
      this.frameCallbacks.delete(cb);
    };
  }

  /** Register an artifact's pointer interaction handlers (consumed by ArtifactRaycaster). */
  registerInteraction(i: ArtifactInteraction): Unregister {
    this.interactions.add(i);
    return () => {
      this.interactions.delete(i);
    };
  }

  getInteractions(): ArtifactInteraction[] {
    return [...this.interactions];
  }

  /** Called by SceneRoot only. */
  runFrame(deltaMs: number, timeMs: number): void {
    for (const cb of this.frameCallbacks) cb(deltaMs, timeMs);
  }

  /** Dispose everything reachable from the scene plus all registered disposables. Idempotent. */
  disposeAll(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.frameCallbacks.clear();

    const seen = new Set<Disposable>();
    const dispose = (d: Disposable): void => {
      if (seen.has(d)) return;
      seen.add(d);
      d.dispose();
    };

    this.scene.traverse((obj) => {
      const mesh = obj as Partial<THREE.Mesh>;
      if (mesh.geometry) dispose(mesh.geometry);
      const mat = mesh.material;
      const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
      for (const m of mats) {
        for (const value of Object.values(m)) {
          if (value instanceof THREE.Texture) dispose(value);
        }
        dispose(m);
      }
      const shadowMap = (obj as { shadow?: { map?: unknown } }).shadow?.map;
      if (isDisposable(shadowMap)) dispose(shadowMap);
    });
    this.scene.clear();

    for (const d of this.disposables) dispose(d);
    this.disposables.clear();

    this.events.dispatchEvent(new Event(SCENE_DISPOSED_EVENT));
  }
}

/** Context handed to artifact factories. */
export interface SceneContext {
  registry: SceneRegistry;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** The WebGL canvas (for pointer listeners). */
  canvas: HTMLCanvasElement;
  events: EventTarget;
}

/** An artifact factory mounts objects into the scene and may return a cleanup function. */
export type ArtifactFactory = (ctx: SceneContext) => void | (() => void);
