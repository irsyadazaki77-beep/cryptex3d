/**
 * Adaptive render quality. Bloom is the only optional cost; if too many frames exceed the
 * budget (or run below ~30 fps) once warm-up has passed, bloom is permanently disabled for
 * the session so the 60 fps loop stays responsive. Pure and React-free.
 */
export interface AdaptiveQualityOptions {
  /** Frames ignored while shaders compile and caches warm. */
  warmupFrames?: number;
  /** Frames per evaluation window. */
  windowFrames?: number;
  /** Fraction of over-budget frames in a window that triggers the downgrade. */
  maxOverRatio?: number;
  /** A frame interval above this (ms) counts as slow even if CPU time was low. */
  slowIntervalMs?: number;
}

export class AdaptiveQuality {
  private seen = 0;
  private windowCount = 0;
  private overCount = 0;
  private disabled = false;
  private readonly warmup: number;
  private readonly window: number;
  private readonly ratio: number;
  private readonly slowInterval: number;

  constructor(
    private readonly budgetMs: number,
    options: AdaptiveQualityOptions = {},
  ) {
    this.warmup = options.warmupFrames ?? 45;
    this.window = options.windowFrames ?? 120;
    this.ratio = options.maxOverRatio ?? 0.5;
    this.slowInterval = options.slowIntervalMs ?? 34;
  }

  get bloomEnabled(): boolean {
    return !this.disabled;
  }

  /** Record one frame. `deltaMs` is the rAF interval, `elapsedMs` the CPU time spent. */
  record(elapsedMs: number, deltaMs: number): void {
    if (this.disabled) return;
    this.seen++;
    if (this.seen <= this.warmup) return;
    // Ignore frames after the tab was hidden (rAF pauses, then resumes with a huge delta).
    if (deltaMs > 1000) return;
    this.windowCount++;
    if (elapsedMs > this.budgetMs || deltaMs > this.slowInterval) this.overCount++;
    if (this.windowCount >= this.window) {
      if (this.overCount / this.windowCount > this.ratio) this.disabled = true;
      this.windowCount = 0;
      this.overCount = 0;
    }
  }
}
