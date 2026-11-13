// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Sends one waveform file to the browser on request (docs/waveform_viewer_spec.md
 * § 7.4, W5): `WAVE-BEGIN`, the file gzip-compressed in binary frames of at most 1 MiB,
 * then `WAVE-END`. Streamed from disk – the server never holds the whole file. A
 * transfer that fails, or whose run stops being the newest, ends with `WAVE-NONE`.
 */

import { createReadStream, promises as fs } from 'node:fs';
import { constants as zlib, createGzip } from 'node:zlib';
import { MAX_BINARY_FRAME_BYTES } from '../frameLimits.js';
import type { ServerFrame } from '../protocol.js';

export interface WaveSink {
  send(frame: ServerFrame): void;
  sendBinary: ((chunk: Buffer) => void) | ((chunk: Buffer) => Promise<void>);
}

export interface WaveTransfer {
  readonly path: string;
  readonly run: number;
  readonly sink: WaveSink;
  /** Still the newest run's waveform, and the socket still open; checked before every frame. */
  readonly isCurrent: () => boolean;
  readonly maxFrameBytes?: number;
}

/** Sends `chunk` in frames of at most `maxFrameBytes`, each awaited; false once the run is no longer current. */
async function sendChunk(transfer: WaveTransfer, chunk: Buffer, maxFrameBytes: number): Promise<boolean> {
  for (let offset = 0; offset < chunk.length; offset += maxFrameBytes) {
    if (!transfer.isCurrent()) return false;
    await transfer.sink.sendBinary(chunk.subarray(offset, offset + maxFrameBytes));
  }
  return true;
}

/** Streams the gzip-compressed file into the sink; resolves with the frame that ends the transfer, or null. */
async function streamCompressed(transfer: WaveTransfer, maxFrameBytes: number): Promise<ServerFrame | null> {
  const { path, run, isCurrent } = transfer;
  // Neither throws: a missing file is an `error` event, and the chunk size is at least
  // zlib's minimum (createGzip throws below it). Output chunks then fill whole frames.
  const source = createReadStream(path);
  const gzip = createGzip({ chunkSize: Math.max(maxFrameBytes, zlib.Z_MIN_CHUNK) });
  source.on('error', (error) => gzip.destroy(error));
  try {
    source.pipe(gzip);
    for await (const chunk of gzip) {
      if (!(await sendChunk(transfer, chunk as Buffer, maxFrameBytes))) return null;
    }
    return isCurrent() ? { verb: 'WAVE-END', run } : null;
  } catch {
    return { verb: 'WAVE-NONE', run };
  } finally {
    source.destroy();
    gzip.destroy();
  }
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
