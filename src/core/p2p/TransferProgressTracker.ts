import { TypedEmitter } from './TypedEmitter';

export interface TransferProgress {
  bytesTransferred: number;
  totalBytes: number;
}

export interface TransferProgressEventMap {
  progress: TransferProgress;
}

/** Tracks byte counts for one transfer at a time and emits 'progress' on every change. */
export class TransferProgressTracker extends TypedEmitter<TransferProgressEventMap> {
  private transferred = 0;
  private total = 0;

  get progress(): TransferProgress {
    return { bytesTransferred: this.transferred, totalBytes: this.total };
  }

  start(totalBytes: number): void {
    this.total = totalBytes;
    this.transferred = 0;
    this.emit('progress', this.progress);
  }

  /** Sets the absolute transferred count (clamped to [0, total]). */
  set(bytesTransferred: number): void {
    this.transferred = Math.max(0, Math.min(bytesTransferred, this.total));
    this.emit('progress', this.progress);
  }

  add(bytes: number): void {
    this.set(this.transferred + bytes);
  }

  reset(): void {
    this.transferred = 0;
    this.total = 0;
  }
}
