// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * gzip bytes → `WaveformData` (docs/waveform_viewer_spec.md § 8.4): decompressed with
 * the platform's `DecompressionStream`, then handed to the parser of the file's format.
 * VCD is parsed while the chunks arrive; GHW once they are all there. Runs in the
 * worker (`waveWorker.ts`), and in the tests directly. No DOM.
 */

import { parseGhw } from './ghwParser';
import type { RunWaveStatus, WaveFormat, WaveformData } from './model';
import { VcdParser } from './vcdParser';

export interface WaveDecoder {
  /** One binary frame of gzip data, in order. */
  push(chunk: Uint8Array): void;
  /** All frames are in: resolves with the parsed waveform, or rejects with why it could not be read. */
  finish(): Promise<WaveformData>;
}

async function readAll(stream: ReadableStream<Uint8Array>, onChunk: (chunk: Uint8Array) => void): Promise<void> {
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    onChunk(value);
  }
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return bytes;
}

export function createWaveDecoder(format: WaveFormat, status: RunWaveStatus): WaveDecoder {
  let feed!: ReadableStreamDefaultController<Uint8Array>;
  const compressed = new ReadableStream<Uint8Array>({ start: (controller) => (feed = controller) });
  const plain = compressed.pipeThrough(new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);

  const parsed: Promise<WaveformData> =
    format === 'vcd'
      ? (async () => {
          const parser = new VcdParser();
          const text = new TextDecoder();
          await readAll(plain, (chunk) => parser.push(text.decode(chunk, { stream: true })));
          parser.push(text.decode());
          return parser.finish(status);
        })()
      : (async () => {
          const chunks: Uint8Array[] = [];
          await readAll(plain, (chunk) => chunks.push(chunk));
          return parseGhw(concat(chunks), status);
        })();
  // Rejections are reported through `finish`; until then nobody may be listening.
  parsed.catch(() => {});

  return {
    push: (chunk) => feed.enqueue(chunk),
    finish: () => {
      feed.close();
      return parsed;
    },
  };
}

/** The buffers of a waveform's typed arrays: moved to the main thread, not copied (§ 8.4). */
export function transferables(data: WaveformData): ArrayBuffer[] {
  const buffers: ArrayBuffer[] = [];
  for (const trace of data.traces.values()) buffers.push(trace.times.buffer as ArrayBuffer, trace.valueIndex.buffer as ArrayBuffer);
  return buffers;
}
