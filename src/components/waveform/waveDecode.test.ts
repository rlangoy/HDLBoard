// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { fixtureBytes, fixtureText } from './fixtures.testSupport';
import { parseGhw } from './ghwParser';
import { parseVcd } from './vcdParser';
import { createWaveDecoder, transferables } from './waveDecode';

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Splits into frames of `size` bytes, the way the server's binary frames arrive. */
function frames(bytes: Uint8Array, size: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.slice(i, i + size));
  return out;
}

describe('createWaveDecoder', () => {
  test('VCD in gzip frames gives the same waveform as parsing the text', async () => {
    const text = fixtureText('icarus_counter.vcd');
    const decoder = createWaveDecoder('vcd', 'complete');
    for (const frame of frames(await gzip(new TextEncoder().encode(text)), 100)) decoder.push(frame);
    const data = await decoder.finish();
    expect(data.root).toEqual(parseVcd(text).root);
    expect(data.endTime).toBe(parseVcd(text).endTime);
  });

  test('GHW in gzip frames', async () => {
    const bytes = fixtureBytes('wave_types.ghw');
    const decoder = createWaveDecoder('ghw', 'complete');
    for (const frame of frames(await gzip(bytes), 333)) decoder.push(frame);
    const data = await decoder.finish();
    expect(data.root).toEqual(parseGhw(bytes).root);
    expect(transferables(data).length).toBe(data.traces.size * 2);
  });

  test('a file that cannot be read rejects with the reason', async () => {
    const decoder = createWaveDecoder('ghw', 'complete');
    decoder.push(await gzip(new TextEncoder().encode('not a waveform')));
    await expect(decoder.finish()).rejects.toThrow(/not a GHW/);
  });
});
