/**
 * P2PManager: serverless WebRTC DataChannel transport.
 * Raw byte arrays only; no crypto/stego, no React/Three.
 * Signaling is manual (copy/paste or QR of SDP). No STUN/TURN: iceServers is empty.
 */
import { TypedEmitter } from './TypedEmitter';

export const ICE_TIMEOUT_MS = 30_000;
export const ICE_GATHER_TIMEOUT_MS = 5_000;
export const DATA_CHANNEL_LABEL = 'cryptex3d';

export type P2PConnectionState = 'new' | 'connecting' | 'connected' | 'failed' | 'closed';

export interface P2PEventMap {
  /** Emitted when no connected candidate pair is established within ICE_TIMEOUT_MS. */
  iceTimeout: void;
  /** Data channel is open and ready for sendData. */
  open: void;
  close: void;
  /** Raw bytes received on the data channel. */
  data: Uint8Array;
  /** Hook for DataChannelHandler: fires when a channel is created (offerer) or received (answerer). */
  channel: RTCDataChannel;
  statechange: P2PConnectionState;
  error: Error;
}

export class P2PError extends Error {
  constructor(
    public readonly code:
      | 'WEBRTC_UNAVAILABLE'
      | 'INVALID_STATE'
      | 'INVALID_SDP'
      | 'CHANNEL_NOT_OPEN',
    message: string,
  ) {
    super(message);
    this.name = 'P2PError';
  }
}

/** Textareas normalize line endings to LF; SDP requires CRLF. */
function normalizeSdp(sdp: string): string {
  const trimmed = sdp.trim();
  if (!trimmed.startsWith('v=')) {
    throw new P2PError('INVALID_SDP', 'Invalid SDP: missing version line');
  }
  return trimmed.replace(/\r?\n/g, '\r\n') + '\r\n';
}

export function isWebRTCAvailable(): boolean {
  return typeof RTCPeerConnection !== 'undefined';
}

export class P2PManager extends TypedEmitter<P2PEventMap> {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private iceTimer: ReturnType<typeof setTimeout> | null = null;
  private state: P2PConnectionState = 'new';
  private readonly iceTimeoutMs: number;
  private readonly gatherTimeoutMs: number;

  constructor(opts: { iceTimeoutMs?: number; gatherTimeoutMs?: number } = {}) {
    super();
    this.iceTimeoutMs = opts.iceTimeoutMs ?? ICE_TIMEOUT_MS;
    this.gatherTimeoutMs = opts.gatherTimeoutMs ?? ICE_GATHER_TIMEOUT_MS;
  }

  /** Underlying channel, for DataChannelHandler (task 11.2). Null until created/received. */
  get dataChannel(): RTCDataChannel | null {
    return this.dc;
  }

  get connectionState(): P2PConnectionState {
    return this.state;
  }

  /** Offerer side: create peer + data channel, return serialized SDP offer after ICE gathering. */
  async createOffer(): Promise<string> {
    const pc = this.initPeer();
    this.attachChannel(pc.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true }));
    this.setState('connecting');
    this.startIceTimer();
    await pc.setLocalDescription(await pc.createOffer());
    return this.waitForLocalSdp(pc);
  }

  /** Offerer side: apply the recipient's SDP answer. */
  async acceptAnswer(sdp: string): Promise<void> {
    const pc = this.pc;
    if (!pc || pc.signalingState !== 'have-local-offer') {
      throw new P2PError('INVALID_STATE', 'No pending offer; call createOffer() first');
    }
    await pc.setRemoteDescription({ type: 'answer', sdp: normalizeSdp(sdp) });
  }

  /** Recipient side: apply an offer and return the serialized SDP answer. */
  async acceptOffer(sdp: string): Promise<string> {
    const normalized = normalizeSdp(sdp);
    const pc = this.initPeer();
    pc.ondatachannel = (e) => this.attachChannel(e.channel);
    this.setState('connecting');
    this.startIceTimer();
    await pc.setRemoteDescription({ type: 'offer', sdp: normalized });
    await pc.setLocalDescription(await pc.createAnswer());
    return this.waitForLocalSdp(pc);
  }

  sendData(data: Uint8Array): void {
    if (!this.dc || this.dc.readyState !== 'open') {
      throw new P2PError('CHANNEL_NOT_OPEN', 'Data channel is not open');
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- DOM typings reject ArrayBufferLike-backed views
    this.dc.send(data as any);
  }

  close(): void {
    this.clearIceTimer();
    this.dc?.close();
    this.pc?.close();
    this.dc = null;
    this.pc = null;
    this.setState('closed');
  }

  // ---- internals ----

  private initPeer(): RTCPeerConnection {
    if (!isWebRTCAvailable()) {
      throw new P2PError('WEBRTC_UNAVAILABLE', 'RTCPeerConnection is not available');
    }
    if (this.pc) {
      throw new P2PError('INVALID_STATE', 'Connection already initialized; create a new P2PManager');
    }
    const pc = new RTCPeerConnection({ iceServers: [] });
    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      if (s === 'connected' || s === 'completed') {
        this.clearIceTimer();
        this.setState('connected');
      } else if (s === 'failed') {
        this.clearIceTimer();
        this.setState('failed');
      }
    };
    this.pc = pc;
    return pc;
  }

  private attachChannel(dc: RTCDataChannel): void {
    dc.binaryType = 'arraybuffer';
    this.dc = dc;
    dc.onopen = () => this.emit('open', undefined);
    dc.onclose = () => this.emit('close', undefined);
    dc.onerror = () => this.emit('error', new P2PError('CHANNEL_NOT_OPEN', 'Data channel error'));
    dc.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) this.emit('data', new Uint8Array(e.data));
    };
    this.emit('channel', dc);
    if (dc.readyState === 'open') this.emit('open', undefined);
  }

  private waitForLocalSdp(pc: RTCPeerConnection): Promise<string> {
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        pc.removeEventListener('icegatheringstatechange', onChange);
        resolve(pc.localDescription?.sdp ?? '');
      };
      const onChange = () => {
        if (pc.iceGatheringState === 'complete') finish();
      };
      const timer = setTimeout(finish, this.gatherTimeoutMs);
      if (pc.iceGatheringState === 'complete') finish();
      else pc.addEventListener('icegatheringstatechange', onChange);
    });
  }

  private startIceTimer(): void {
    this.clearIceTimer();
    this.iceTimer = setTimeout(() => {
      this.iceTimer = null;
      if (this.state !== 'connected') this.emit('iceTimeout', undefined);
    }, this.iceTimeoutMs);
  }

  private clearIceTimer(): void {
    if (this.iceTimer !== null) {
      clearTimeout(this.iceTimer);
      this.iceTimer = null;
    }
  }

  private setState(next: P2PConnectionState): void {
    if (this.state === next) return;
    this.state = next;
    this.emit('statechange', next);
  }
}
