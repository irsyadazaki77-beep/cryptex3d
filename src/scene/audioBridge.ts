/**
 * Scene-to-audio bridge. Lazily imports src/core/audio (dynamic import, own chunk) and
 * routes ring-click SFX plus camera position updates. No React and no store imports.
 */
import type { ArtifactFactory } from './sceneRegistry';

const POSITION_EPSILON = 1e-3;

export const audioBridgeFactory: ArtifactFactory = (ctx) => {
  const { registry, camera } = ctx;
  let disposed = false;
  const cleanups: Array<() => void> = [];

  void Promise.all([import('../core/audio/TactileSFX'), import('../core/audio/SpatialMixer')])
    .then(([sfx, mixerMod]) => {
      if (disposed) return;
      const mixer = new mixerMod.SpatialMixer();
      cleanups.push(() => mixer.dispose());
      cleanups.push(sfx.subscribeRingClicks(registry.events, undefined, () => mixer.input));

      let lx = Number.NaN;
      let ly = Number.NaN;
      let lz = Number.NaN;
      cleanups.push(
        registry.onFrame(() => {
          const { x, y, z } = camera.position;
          if (
            Math.abs(x - lx) < POSITION_EPSILON &&
            Math.abs(y - ly) < POSITION_EPSILON &&
            Math.abs(z - lz) < POSITION_EPSILON
          ) {
            return;
          }
          lx = x;
          ly = y;
          lz = z;
          mixer.update(x, y, z);
        }),
      );
    })
    .catch(() => undefined); // audio failures are suppressed silently

  return () => {
    disposed = true;
    for (const c of cleanups) c();
    cleanups.length = 0;
  };
};
