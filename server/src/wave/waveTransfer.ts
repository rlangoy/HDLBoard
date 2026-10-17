// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Sends one waveform file to the browser on request (docs/waveform_viewer_spec.md
 * § 7.4, W5): `WAVE-BEGIN`, the file gzip-compressed in binary frames of at most 1 MiB,
 * then `WAVE-END`. Streamed from disk – the server never holds the whole file. A
 * transfer that fails, or whose run stops being the newest, ends with `WAVE-NONE`.
 */

import { createReadStream, promises as fs } from 'node:fs';
import { createGzip } from 'node:zlib';
import type { ServerFrame } from '../protocol.js';

/** 1 MiB. */
export const MAX_BINARY_FRAME_BYTES = 1_048_576;

export interface WaveSink {
  send(frame: ServerFrame): void;
  sendBinary(chunk: Buffer): void;
}

export interface WaveTransfer {
  readonly path: string;
  readonly run: number;
  readonly sink: WaveSink;
  /** Still the newest run's waveform, and the socket still open; checked before every frame. */
  readonly isCurrent: () => boolean;
  readonly maxFrameBytes?: number;
}

/** Collects gzip output into binary frames of exactly `maxBytes`, the last one shorter. */
class FrameBuffer {
  private pending: Buffer[] = [];
  private pendingBytes = 0;

  constructor(
    private readonly maxBytes: number,
    private readonly sendFrame: (frame: Buffer) => void,
  ) {}

  /** Adds `chunk`; returns false as soon as the transfer should stop. */
  add(chunk: Buffer, isCurrent: () => boolean): boolean {
    for (let offset = 0; offset < chunk.length; ) {
      if (!isCurrent()) return false;
      const take = Math.min(chunk.length - offset, this.maxBytes - this.pendingBytes);
      this.pending.push(chunk.subarray(offset, offset + take));
      this.pendingBytes += take;
      offset += take;
      if (this.pendingBytes === this.maxBytes) this.flush();
    }
    return true;
  }

  flush(): void {
    if (this.pendingBytes === 0) return;
    this.sendFrame(Buffer.concat(this.pending, this.pendingBytes));
    this.pending = [];
    this.pendingBytes = 0;
  }
}

/** Streams the gzip-compressed file into the sink; resolves with the frame that ends the transfer, or null. */
function streamCompressed(transfer: WaveTransfer, maxFrameBytes: number): Promise<ServerFrame | null> {
  const { path, run, sink, isCurrent } = transfer;
  return new Promise((resolve) => {
    const source = createReadStream(path);
    const gzip = createGzip();
    const frames = new FrameBuffer(maxFrameBytes, (frame) => sink.sendBinary(frame));
    let finished = false;
    const finish = (end: ServerFrame | null) => {
      if (finished) return;
      finished = true;
      source.destroy();
      gzip.destroy();
      resolve(end);
    };
    gzip.on('data', (chunk: Buffer) => {
      if (!frames.add(chunk, isCurrent)) finish(null);
    });
    gzip.on('end', () => {
      if (!isCurrent()) return finish(null);
      frames.flush();
      finish({ verb: 'WAVE-END', run });
    });
    const fail = () => finish({ verb: 'WAVE-NONE', run });
    source.on('error', fail);
    gzip.on('error', fail);
    source.pipe(gzip);
  });
}

async function fileSize(path: string): Promise<number | undefined> {
  try {
    return (await fs.stat(path)).size;
  } catch {
    return undefined;
  }
}

/** Resolves once the transfer has ended, with `WAVE-END` or `WAVE-NONE`. Never rejects. */
export async function sendWaveFile(transfer: WaveTransfer): Promise<void> {
  const { path, run, sink, isCurrent, maxFrameBytes = MAX_BINARY_FRAME_BYTES } = transfer;
  const bytes = await fileSize(path);
  if (bytes === undefined) {
    if (isCurrent()) sink.send({ verb: 'WAVE-NONE', run });
    return;
  }
  if (!isCurrent()) return;
  sink.send({ verb: 'WAVE-BEGIN', run, bytes });
  const end = await streamCompressed(transfer, maxFrameBytes);
  if (end !== null && isCurrent()) sink.send(end);
}
