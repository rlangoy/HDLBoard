// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { WebSocket } from 'ws';
import { MAX_FRAME_HEADER_BYTES } from './frameLimits.js';
import type { WsLimits } from './wsLimits.js';

/** The part of a `ws` WebSocket that output needs. */
export interface OutputSocket {
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(data: string | Buffer, options: { binary: boolean }, callback: (error?: Error) => void): void;
  pong(data: Buffer): void;
}

export interface SocketOutputOptions {
  readonly socket: OutputSocket;
  readonly limits: Pick<WsLimits, 'outgoingBytes' | 'sendTimeoutMs'>;
  /**
   * Called once, when the queue would pass `outgoingBytes`, a write fails, or none
   * completes in `sendTimeoutMs`. Output has stopped by then; the caller cuts the socket.
   */
  readonly onFailure: (reason: string) => void;
}

/**
 * Everything one connection sends, under one cap on what may wait in the socket's queue,
 * so a client that stops reading cannot make the backend buffer without limit. A binary
 * sender awaits each frame (a waveform is read from disk only as fast as it leaves).
 */
export class SocketOutput {
  private stopped = false;
  /** The callbacks of the writes not yet done, each resolved once. */
  private readonly pending = new Set<() => void>();
  private stallTimer: NodeJS.Timeout | undefined;

  constructor(private readonly options: SocketOutputOptions) {}

  send(text: string): void {
    this.enqueue(text, () => {});
  }

  /** Resolves when the frame is written, or will never be (output stopped). */
  sendBinary(chunk: Buffer): Promise<void> {
    return new Promise((resolve) => this.enqueue(chunk, resolve));
  }

  /** Answers a client's ping, under the same cap. */
  pong(data: Buffer): void {
    if (!this.isOpen()) return;
    if (this.fits(data.length)) this.options.socket.pong(data);
    else this.fail('outgoing buffer limit');
  }

  /** Stops all output and releases every waiting sender. */
  dispose(): void {
    this.stopped = true;
    this.stopStallTimer();
    for (const done of this.pending) done();
    this.pending.clear();
  }

  private enqueue(data: string | Buffer, done: () => void): void {
    if (!this.isOpen()) return done();
    if (!this.fits(Buffer.byteLength(data))) {
      this.fail('outgoing buffer limit');
      return done();
    }
    this.pending.add(done);
    this.stallTimer ??= this.startStallTimer();
    const complete = (error?: Error) => this.complete(done, error);
    try {
      this.options.socket.send(data, { binary: Buffer.isBuffer(data) }, complete);
    } catch (error) {
      complete(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private isOpen(): boolean {
    return !this.stopped && this.options.socket.readyState === WebSocket.OPEN;
  }

  /** Whether a frame of `bytes` fits in the queue beside what already waits there. */
  private fits(bytes: number): boolean {
    return this.options.socket.bufferedAmount + bytes + MAX_FRAME_HEADER_BYTES <= this.options.limits.outgoingBytes;
  }

  private complete(done: () => void, error?: Error): void {
    if (!this.pending.delete(done)) return;
    if (error) this.fail('send failed');
    this.restartStallTimer();
    done();
  }

  /** A write completed: the next one gets the whole timeout again. */
  private restartStallTimer(): void {
    this.stopStallTimer();
    if (!this.stopped && this.pending.size > 0) this.stallTimer = this.startStallTimer();
  }

  private startStallTimer(): NodeJS.Timeout {
    return setTimeout(() => this.fail('send stalled'), this.options.limits.sendTimeoutMs).unref();
  }

  private stopStallTimer(): void {
    clearTimeout(this.stallTimer);
    this.stallTimer = undefined;
  }

  private fail(reason: string): void {
    if (this.stopped) return;
    this.dispose();
    this.options.onFailure(reason);
  }
}
