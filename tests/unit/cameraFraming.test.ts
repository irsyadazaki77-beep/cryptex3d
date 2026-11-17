import { describe, expect, it } from 'vitest';
import { FRAME_HALF_HEIGHT, FRAME_HALF_WIDTH, fitCameraDistance } from '../../src/scene/cameraFraming';

describe('fitCameraDistance', () => {
  it('frames the full artifact extents at common aspect ratios', () => {
    for (const aspect of [0.6, 1, 16 / 9, 21 / 9]) {
      const d = fitCameraDistance(50, aspect);
      const tanV = Math.tan((50 * Math.PI) / 360);
      expect(d * tanV).toBeGreaterThanOrEqual(FRAME_HALF_HEIGHT);
      expect(d * tanV * aspect).toBeGreaterThanOrEqual(FRAME_HALF_WIDTH);
    }
  });
});
