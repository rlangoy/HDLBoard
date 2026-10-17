// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The Web Worker that turns a waveform transfer into `WaveformData`, so a large file
 * never freezes the editor or the board (docs/waveform_viewer_spec.md § 8.4, NFR-1).
 * One transfer at a time; a new `begin` abandons the one before.
 */

import { WaveParseError } from './model';
import { createWaveDecoder, transferables, type WaveDecoder } from './waveDecode';
import type { WorkerReply, WorkerRequest } from './workerMessages';

let current: { run: number; decoder: WaveDecoder } | null = null;

const reply = (message: WorkerReply, transfer: Transferable[] = []) =>
  (self as unknown as { postMessage(message: WorkerReply, transfer: Transferable[]): void }).postMessage(message, transfer);

function errorText(e: unknown): string {
  if (e instanceof WaveParseError) return e.message;
  return 'The waveform could not be read: the file is damaged or incomplete.';
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === 'begin') {
    current = { run: message.run, decoder: createWaveDecoder(message.format, message.status) };
  } else if (message.type === 'chunk') {
    if (current?.run === message.run) current.decoder.push(new Uint8Array(message.chunk));
  } else if (message.type === 'end') {
    const transfer = current;
    if (transfer?.run !== message.run) return;
    current = null;
    transfer.decoder.finish().then(
      (data) => reply({ type: 'done', run: transfer.run, data }, transferables(data)),
      (e: unknown) => reply({ type: 'error', run: transfer.run, message: errorText(e) }),
    );
  } else if (message.type === 'abort') {
    current = null;
  }
};
