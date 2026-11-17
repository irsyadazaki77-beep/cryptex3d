import { TypedEmitter } from './TypedEmitter';

export const BROADCAST_CHANNEL_NAME = 'cryptex3d-p2p';

export interface BroadcastChannelFallbackEvents {
  received: Uint8Array;
}

/**
 * BroadcastChannel transport fallback. Raw bytes only.
 * A BroadcastChannel object never receives its own messages, but two
 * instances on the same name (same or different tab) do receive each other.
 */
export class BroadcastChannelFallback extends TypedEmitter<BroadcastChannelFallbackEvents> {
  private channel: BroadcastChannel | null = null;

  constructor(private readonly channelName: string = BROADCAST_CHANNEL_NAME) {
    super();
  }

  /** True when RTCPeerConnection is available in this environment. */
  static isRTCAvailable(): boolean {
    return typeof (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection !== 'undefined';
  }

  /** Creates an instance and activates it only if RTCPeerConnection is unavailable. */
  static autoActivate(channelName?: string): BroadcastChannelFallback {
    const fallback = new BroadcastChannelFallback(channelName);
    if (!BroadcastChannelFallback.isRTCAvailable()) fallback.activateFallback();
    return fallback;
  }

  get isActive(): boolean {
    return this.channel !== null;
  }

  /** Opens the channel. Idempotent. */
  activateFallback(): void {
    if (this.channel) return;
    if (typeof BroadcastChannel === 'undefined') {
      throw new Error('BROADCAST_CHANNEL_UNAVAILABLE');
    }
    const channel = new BroadcastChannel(this.channelName);
    channel.onmessage = (ev: MessageEvent) => {
      const data: unknown = ev.data;
      if (data instanceof Uint8Array) {
        this.emit('received', new Uint8Array(data));
      } else if (data instanceof ArrayBuffer) {
        this.emit('received', new Uint8Array(data));
      }
    };
    this.channel = channel;
  }

  /** Alias for activateFallback (Same-Device Mode). */
  activate(): void {
    this.activateFallback();
  }

  send(data: Uint8Array): void {
    if (!this.channel) throw new Error('BROADCAST_CHANNEL_NOT_ACTIVE');
    // Copy so the posted buffer is exactly the bytes of the view.
    this.channel.postMessage(new Uint8Array(data));
  }

  close(): void {
    if (!this.channel) return;
    this.channel.onmessage = null;
    this.channel.close();
    this.channel = null;
  }
}
