/**
 * ArtifactRaycaster: routes canvas pointer events to registered artifact interactions
 * and gates OrbitControls while an artifact is being interacted with.
 * No React and no store imports.
 */
import * as THREE from 'three';
import type { ArtifactInteraction, ArtifactPointerEvent } from '../artifacts/types';
import type { ArtifactFactory, SceneContext } from '../sceneRegistry';
import { OrbitControlsWrapper, type OrbitToggle } from './OrbitControlsWrapper';

export interface ArtifactHit {
  interaction: ArtifactInteraction;
  hit: THREE.Intersection;
}

export type HitTest = (clientX: number, clientY: number) => ArtifactHit | null;

/**
 * Pure routing state machine. Orbit controls are disabled while an artifact is captured
 * (pointer down on any artifact, until pointer up) or while the crystal is hovered.
 */
export class PointerRouter {
  private hovered: ArtifactInteraction | null = null;
  private captured: ArtifactInteraction | null = null;

  constructor(
    private readonly hitTest: HitTest,
    private readonly orbit: OrbitToggle,
  ) {}

  getHovered(): ArtifactInteraction | null {
    return this.hovered;
  }

  getCaptured(): ArtifactInteraction | null {
    return this.captured;
  }

  pointerDown(e: ArtifactPointerEvent): void {
    const found = this.hitTest(e.clientX, e.clientY);
    if (!found) return;
    this.setHovered(found.interaction);
    this.captured = found.interaction;
    this.syncOrbit();
    found.interaction.onPointerDown?.(e);
  }

  pointerMove(e: ArtifactPointerEvent): void {
    if (this.captured) {
      this.captured.onPointerMove?.(e);
      return;
    }
    this.setHovered(this.hitTest(e.clientX, e.clientY)?.interaction ?? null);
    this.hovered?.onPointerMove?.(e);
  }

  pointerUp(e: ArtifactPointerEvent): void {
    const target = this.captured;
    if (!target) return;
    this.captured = null;
    target.onPointerUp?.(e);
    this.setHovered(this.hitTest(e.clientX, e.clientY)?.interaction ?? null);
    this.syncOrbit();
  }

  click(e: ArtifactPointerEvent): void {
    const found = this.hitTest(e.clientX, e.clientY);
    found?.interaction.onClick?.(found.hit);
  }

  /** Pointer left the canvas. Releases hover; a captured drag stays captured until pointer up. */
  pointerLeave(): void {
    this.setHovered(null);
  }

  /** Cancel any capture/hover (pointercancel, dispose). */
  reset(): void {
    this.captured = null;
    this.setHovered(null);
    this.syncOrbit();
  }

  private setHovered(next: ArtifactInteraction | null): void {
    if (next === this.hovered) return;
    const prev = this.hovered;
    this.hovered = next;
    prev?.onPointerLeave?.();
    next?.onPointerEnter?.();
    this.syncOrbit();
  }

  private syncOrbit(): void {
    const interacting = this.captured !== null || this.hovered?.id === 'crystal';
    if (interacting) this.orbit.disable();
    else this.orbit.enable();
  }
}

/** Build a HitTest that raycasts the registered interactions' objects (nearest hit wins). */
export function createHitTest(
  getInteractions: () => ArtifactInteraction[],
  camera: THREE.Camera,
  canvas: HTMLElement,
): HitTest {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  return (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    let best: ArtifactHit | null = null;
    for (const interaction of getInteractions()) {
      const [hit] = raycaster.intersectObject(interaction.object, true);
      if (hit && (!best || hit.distance < best.hit.distance)) best = { interaction, hit };
    }
    return best;
  };
}

export interface InstalledControls {
  orbit: OrbitControlsWrapper;
  router: PointerRouter;
  dispose(): void;
}

/** Wire orbit controls + pointer routing onto the scene canvas. */
export function installControls(ctx: SceneContext): InstalledControls {
  const { canvas, camera, registry } = ctx;
  const orbit = new OrbitControlsWrapper(camera, canvas);
  const router = new PointerRouter(createHitTest(() => registry.getInteractions(), camera, canvas), orbit);

  const toArtifactEvent = (e: PointerEvent | MouseEvent): ArtifactPointerEvent => ({
    clientX: e.clientX,
    clientY: e.clientY,
    movementX: e.movementX,
    movementY: e.movementY,
  });

  const onDown = (e: PointerEvent): void => {
    router.pointerDown(toArtifactEvent(e));
    if (router.getCaptured()) {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // pointer may already be released; ignore
      }
    }
  };
  const onMove = (e: PointerEvent): void => router.pointerMove(toArtifactEvent(e));
  const onUp = (e: PointerEvent): void => {
    router.pointerUp(toArtifactEvent(e));
    if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };
  const onCancel = (): void => router.reset();
  const onLeave = (): void => router.pointerLeave();
  const onClick = (e: MouseEvent): void => router.click(toArtifactEvent(e));

  // Registered after OrbitControls' own listeners would run too late for pointerdown,
  // but hover/capture state is established earlier, so orbit is already disabled by then
  // for the crystal; for others, capture-phase listener on the canvas runs first.
  canvas.addEventListener('pointerdown', onDown, true);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('click', onClick);

  const offFrame = registry.onFrame(() => orbit.update());

  let disposed = false;
  return {
    orbit,
    router,
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener('pointerdown', onDown, true);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('click', onClick);
      offFrame();
      router.reset();
      orbit.dispose();
    },
  };
}

/** ArtifactFactory-compatible setup; SceneRoot (task 10.7) can pass this to its factory list. */
export const controlsFactory: ArtifactFactory = (ctx) => {
  const installed = installControls(ctx);
  return () => installed.dispose();
};
