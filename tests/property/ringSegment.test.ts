import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import fc from 'fast-check';
import { advanceSegment, createCryptexRing } from '../../src/scene/artifacts/CryptexRing';
import { SceneRegistry } from '../../src/scene/sceneRegistry';
import { ARTIFACT_STATE_EVENT } from '../../src/scene/SpatialKeySerializer';
import type { ArtifactStateDetail } from '../../src/scene/SpatialKeySerializer';

// Feature: cryptex3d, Property 10: ring segment position after N clicks === (P+N) % 10
describe('Property 10: ring segment advance', () => {
  it('advanceSegment applied N times from P yields (P+N)%10', () => {
    // **Validates: Requirements 1.3**
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 9 }), fc.integer({ min: 0, max: 200 }), (p, n) => {
        let x = p;
        for (let i = 0; i < n; i++) x = advanceSegment(x);
        return x === (p + n) % 10;
      }),
      { numRuns: 500 },
    );
  });

  it('CryptexRing segment position after P + N clicks === (P+N)%10', () => {
    // **Validates: Requirements 1.3**
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 0, max: 40 }),
        fc.integer({ min: 0, max: 7 }),
        (p, n, segIndex) => {
          const registry = new SceneRegistry(new THREE.Scene());
          const cleanup = createCryptexRing({
            registry,
            scene: registry.scene,
            camera: new THREE.PerspectiveCamera(),
            canvas: {} as HTMLCanvasElement,
            events: registry.events,
          });
          try {
            const interaction = registry.getInteractions().find((i) => i.id === 'ring')!;
            const segs = interaction.object.children.filter((c) => c instanceof THREE.Mesh);
            let latest: number[] = new Array<number>(8).fill(0);
            registry.events.addEventListener(ARTIFACT_STATE_EVENT, (e) => {
              latest = (e as CustomEvent<ArtifactStateDetail>).detail.ringSegments.slice();
            });
            const click = () =>
              interaction.onClick?.({ object: segs[segIndex] } as unknown as THREE.Intersection);

            // Reach initial position P (ring starts at 0), then apply N further clicks.
            for (let i = 0; i < p; i++) click();
            expect(latest[segIndex]).toBe(p);
            for (let i = 0; i < n; i++) click();

            expect(latest[segIndex]).toBe((p + n) % 10);
            // Other segments untouched.
            latest.forEach((v, i) => {
              if (i !== segIndex) expect(v).toBe(0);
            });
            return true;
          } finally {
            if (typeof cleanup === 'function') cleanup();
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});
