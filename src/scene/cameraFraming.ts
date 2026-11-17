/**
 * Camera framing for the default artifact layout. Pure math, no Three.js imports.
 *
 * Layout (x extents): monolith -4.2..-3.0, crystal -0.8..0.8, ring 1.82..4.98.
 * Max vertical half-extent is the ring (~1.6).
 */
export const FRAME_HALF_WIDTH = 5.1;
export const FRAME_HALF_HEIGHT = 1.7;
/** Extra distance factor so artifacts do not touch the viewport edge. */
export const FRAME_MARGIN = 1.15;

/** Distance from the origin at which a box of the given half extents fits the view. */
export function fitCameraDistance(
  fovDeg: number,
  aspect: number,
  halfWidth: number = FRAME_HALF_WIDTH,
  halfHeight: number = FRAME_HALF_HEIGHT,
  margin: number = FRAME_MARGIN,
): number {
  const tanV = Math.tan((fovDeg * Math.PI) / 360);
  const tanH = tanV * Math.max(aspect, 0.01);
  return Math.max(halfHeight / tanV, halfWidth / tanH) * margin;
}
