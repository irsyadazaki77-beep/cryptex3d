/**
 * DataChannelHandler: chunked transfer with backpressure over P2PManager's data channel.
 * Raw bytes only; no crypto/stego. On mid-transfer WebRTC failure, activates the
 * BroadcastChannel fallback.
 */
import type { P2PManager } from './P2PManager';
import { TypedEmitter } from './TypedEmitter';
import { TransferProgressTracker, type TransferProgress } from './TransferProgressTracker';
import {
  CHUNK_SIZE,
  Reassembler,
  FramingError,
  chunkData,
  decodeFrame,
  encodeAckFrame,
} from './framing';

export const BUFFER_HIGH_WATER_MARK = 256 * 1024;
export const BUFFER_LOW_THRESHOLD = 64 * 1024;

export interface FallbackActivator {
  activateFallback(): void;
}

export type DataChannelTransport = Pick<P2PManager, 'dataChannel' | 'on' | 'sendData'>;

export interface DataChannelHandlerEventMap {
  progress: TransferProgress;
  /** Full payload reassembled on the receiving side. */
  complete: Uint8Array;
  /** Sender side: receiver acked all chunks. */
  sent: void;
  /** Mid-transfer failure; fallback has been activated. */
  fallback: void;
  error: Error;
}

export class DataChannelHandler extends TypedEmitter<DataChannelHandlerEventMap> {
  private readonly tracker = new TransferProgressTracker();
  private reassembler: Reassembler | null = null;
  private sending: {
    chunkCount: number;
    resolve: () => void;
    reject: (e: Error) => void;
  } | null = null;
  private fallbackActivated = false;
  private readonly unsubs: Array<() => void> = [];
  private channelWaiters = new Set<() => void>();

  constructor(
    private readonly transport: DataChannelTransport,
    private readonly fallback: FallbackActivator,
    private readonly opts: { highWaterMark?: number; lowThreshold?: number } = {},
  ) {
    super();
    this.unsubs.push(
      this.tracker.on('progress', (p) => this.emit('progress', p)),
      transport.on('channel', (dc) => this.configureChannel(dc)),
      transport.on('data', (bytes) => this.onData(bytes)),
      transport.on('close', () => this.onTransportFailure('Data channel closed')),
      transport.on('error', (e) => this.onTransportFailure(e.message)),
      transport.on('statechange', (s) => {
        if (s === 'failed') this.onTransportFailure('Connection failed');
      }),
    );
    if (transport.dataChannel) this.configureChannel(transport.dataChannel);
  }

  /** Sends data in 16 KB chunks; resolves once the receiver acks every chunk. */
  send(data: Uint8Array): Promise<void> {
    if (this.sending) return Promise.reject(new Error('Transfer already in progress'));
    const frames = chunkData(data, CHUNK_SIZE);
    const done = new Promise<void>((resolve, reject) => {
      this.sending = { chunkCount: frames.length - 1, resolve, reject };
    });
    this.tracker.start(data.length);
    void this.pump(frames, data.length);
    return done;
  }

  dispose(): void {
    for (const u of this.unsubs.splice(0)) u();
    this.wakeWaiters();
  }

  // ---- sending ----

  private async pump(frames: Uint8Array[], totalLength: number): Promise<void> {
    try {
      let sent = 0;
      for (let i = 0; i < frames.length; i++) {
        if (!this.sending) return;
        if (i > 0) await this.waitForDrain();
        if (!this.sending) return;
        this.transport.sendData(frames[i]);
        if (i > 0) {
          sent += frames[i].length - 5;
          this.tracker.set(Math.min(sent, totalLength));
        }
      }
    } catch (e) {
      this.onTransportFailure(e instanceof Error ? e.message : 'Send failed');
    }
  }

  private async waitForDrain(): Promise<void> {
    const dc = this.transport.dataChannel;
    if (!dc) return;
    const high = this.opts.highWaterMark ?? BUFFER_HIGH_WATER_MARK;
    while (this.sending && dc.bufferedAmount > high) {
      await new Promise<void>((resolve) => {
        const finish = () => {
          dc.removeEventListener('bufferedamountlow', finish);
          this.channelWaiters.delete(finish);
          resolve();
        };
        dc.addEventListener('bufferedamountlow', finish);
        this.channelWaiters.add(finish);
      });
    }
  }

  private wakeWaiters(): void {
    for (const w of [...this.channelWaiters]) w();
  }

  private configureChannel(dc: RTCDataChannel): void {
    dc.bufferedAmountLowThreshold = this.opts.lowThreshold ?? BUFFER_LOW_THRESHOLD;
  }

  // ---- receiving ----

  private onData(bytes: Uint8Array): void {
    const frame = decodeFrame(bytes);
    if (!frame) return;
    try {
      switch (frame.type) {
        case 'start':
          this.reassembler = new Reassembler();
          this.reassembler.start(frame.totalLength, frame.chunkCount);
          this.tracker.start(frame.totalLength);
          this.maybeFinishReceive();
          break;
        case 'data': {
          if (!this.reassembler) throw new FramingError('NO_START', 'Data frame before start frame');
          this.reassembler.addChunk(frame.index, frame.payload);
          this.tracker.set(this.reassembler.bytesReceived);
          this.maybeFinishReceive();
          break;
        }
        case 'ack':
          if (this.sending && frame.chunksReceived === this.sending.chunkCount) {
            const s = this.sending;
            this.sending = null;
            s.resolve();
            this.emit('sent', undefined);
          }
          break;
      }
    } catch (e) {
      this.reassembler = null;
      this.emit('error', e instanceof Error ? e : new Error('Malformed transfer'));
    }
  }

  private maybeFinishReceive(): void {
    const r = this.reassembler;
    if (!r || !r.isComplete) return;
    const payload = r.assemble();
    const count = r.chunksReceived;
    this.reassembler = null;
    this.transport.sendData(encodeAckFrame(count));
    this.emit('complete', payload);
  }

  // ---- failure ----

  private onTransportFailure(message: string): void {
    const active = this.sending !== null || this.reassembler !== null;
    if (!active) return;
    const pending = this.sending;
    this.sending = null;
    this.reassembler = null;
    this.wakeWaiters();
    if (!this.fallbackActivated) {
      this.fallbackActivated = true;
      this.fallback.activateFallback();
    }
    const err = new Error(`WebRTC transfer failed: ${message}`);
    pending?.reject(err);
    this.emit('fallback', undefined);
    this.emit('error', err);
  }
}
