/**
 * AudioEngine: lazily creates the AudioContext on the first user interaction
 * and exposes the context and master gain. Failures are suppressed silently
 * (Requirement 8.5).
 */

type ReadyListener = (engine: AudioEngine) => void;

type AudioContextCtor = new () => AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  const g = globalThis as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

const INTERACTION_EVENTS = ['pointerdown', 'keydown'] as const;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private listening = false;
  private disposed = false;
  private readyListeners = new Set<ReadyListener>();

  private readonly onInteraction = (): void => {
    this.removeInteractionListeners();
    this.initialize();
  };

  /** Begin listening (once) for the first user interaction. */
  start(): void {
    if (this.listening || this.ctx || this.disposed) return;
    if (typeof window === 'undefined') return;
    this.listening = true;
    for (const evt of INTERACTION_EVENTS) {
      window.addEventListener(evt, this.onInteraction, { once: true, passive: true });
    }
  }

  /** The AudioContext, or null if not yet created or creation failed. */
  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Master output gain, or null if audio is unavailable. */
  get masterGain(): GainNode | null {
    return this.master;
  }

  get isReady(): boolean {
    return this.ctx !== null && this.master !== null;
  }

  /**
   * Register a callback invoked when the engine is ready. Fires immediately
   * if already ready. Returns an unsubscribe function.
   */
  onReady(listener: ReadyListener): () => void {
    if (this.isReady) {
      listener(this);
      return () => undefined;
    }
    this.readyListeners.add(listener);
    return () => {
      this.readyListeners.delete(listener);
    };
  }

  dispose(): void {
    this.disposed = true;
    this.removeInteractionListeners();
    this.readyListeners.clear();
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    if (ctx && ctx.state !== 'closed') {
      ctx.close().catch(() => undefined);
    }
  }

  private removeInteractionListeners(): void {
    if (!this.listening) return;
    this.listening = false;
    for (const evt of INTERACTION_EVENTS) {
      window.removeEventListener(evt, this.onInteraction);
    }
  }

  private initialize(): void {
    if (this.ctx || this.disposed) return;
    try {
      const Ctor = getAudioContextCtor();
      if (!Ctor) return;
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      // Resume to satisfy autoplay policy; state becomes 'running'.
      ctx.resume().catch(() => undefined);
    } catch {
      // Suppress silently: no error shown or logged (Requirement 8.5).
      this.ctx = null;
      this.master = null;
      return;
    }
    for (const listener of [...this.readyListeners]) {
      try {
        listener(this);
      } catch {
        // Listener failures must not affect audio setup.
      }
    }
    this.readyListeners.clear();
  }
}

let shared: AudioEngine | null = null;

/** Shared singleton instance. */
export function getAudioEngine(): AudioEngine {
  if (!shared) shared = new AudioEngine();
  return shared;
}
