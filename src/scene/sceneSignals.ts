/**
 * Tiny React-free signal bridge between the HUD and the render loop. The HUD writes the
 * flag from store subscriptions; the loop reads it once per frame. It never triggers a
 * React render and carries no secret data (a single boolean).
 */
let pipelineActive = false;

export function setPipelineActive(active: boolean): void {
  pipelineActive = active;
}

export function isPipelineActive(): boolean {
  return pipelineActive;
}
