import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import fc from 'fast-check';
import { advanceSegment, createCryptexRing, RING_SEGMENT_ROTATED_EVENT } from '../../src/scene/artifacts/CryptexRing';
import { SceneRegistry } from '../../src/scene/sceneRegistry';
import { ARTIFACT_STATE_EVENT } from '../../src/scene/SpatialKeySerializer';
import type { ArtifactStateDetail } from '../../src/scene/SpatialKeySerializer';

describe('advanceSegment', () => {
  it('wraps 9 to 0', () => {
    expect(advanceSegment(9)).toBe(0);
    expect(advanceSegment(0)).toBe(1);
  });
  it('always yields 0-9 and returns to start after 10 steps', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 9 }), (p) => {
        let x = p;
        for (let i = 0; i < 10; i++) {
          x = advanceSegment(x);
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(9);
        }
        return x === p;
      }),
    );
  });
});

describe('CryptexRing', () => {
  it('builds 8 segments, emits state and rotation event on click', () => {
    const registry = new SceneRegistry(new THREE.Scene());
    const cleanup = createCryptexRing({
      registry,
      scene: registry.scene,
      camera: new THREE.PerspectiveCamera(),
      canvas: {} as HTMLCanvasElement,
      events: registry.events,
    });
    const interaction = registry.getInteractions().find((i) => i.id === 'ring')!;
    const segs = interaction.object.children.filter((c) => c instanceof THREE.Mesh);
    expect(segs).toHaveLength(8);

    let detail: ArtifactStateDetail | undefined;
    let rotated: { index: number; position: number } | undefined;
    registry.events.addEventListener(ARTIFACT_STATE_EVENT, (e) => {
      detail = (e as CustomEvent<ArtifactStateDetail>).detail;
    });
    registry.events.addEventListener(RING_SEGMENT_ROTATED_EVENT, (e) => {
      rotated = (e as CustomEvent<{ index: number; position: number }>).detail;
    });
    interaction.onClick?.({ object: segs[3] } as unknown as THREE.Intersection);
    expect(detail?.ringSegments).toEqual([0, 0, 0, 1, 0, 0, 0, 0]);
    expect(rotated).toEqual({ index: 3, position: 1 });

    if (typeof cleanup === 'function') cleanup();
    expect(registry.getInteractions()).toHaveLength(0);
  });
});
