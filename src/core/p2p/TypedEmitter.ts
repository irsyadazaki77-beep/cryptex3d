/**
 * Minimal typed event emitter built on EventTarget.
 * EventMap maps event name -> detail payload type (use `void` for none).
 */
export class TypedEmitter<EventMap extends { [K in keyof EventMap]: unknown }> {
  private readonly target = new EventTarget();
  private readonly wrappers = new Map<
    (detail: never) => void,
    Map<string, EventListener>
  >();

  on<K extends keyof EventMap & string>(
    type: K,
    listener: (detail: EventMap[K]) => void,
  ): () => void {
    const wrapped: EventListener = (e) => listener((e as CustomEvent<EventMap[K]>).detail);
    let byType = this.wrappers.get(listener as (detail: never) => void);
    if (!byType) {
      byType = new Map();
      this.wrappers.set(listener as (detail: never) => void, byType);
    }
    byType.set(type, wrapped);
    this.target.addEventListener(type, wrapped);
    return () => this.off(type, listener);
  }

  off<K extends keyof EventMap & string>(
    type: K,
    listener: (detail: EventMap[K]) => void,
  ): void {
    const byType = this.wrappers.get(listener as (detail: never) => void);
    const wrapped = byType?.get(type);
    if (wrapped) {
      this.target.removeEventListener(type, wrapped);
      byType!.delete(type);
      if (byType!.size === 0) this.wrappers.delete(listener as (detail: never) => void);
    }
  }

  protected emit<K extends keyof EventMap & string>(type: K, detail: EventMap[K]): void {
    this.target.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
