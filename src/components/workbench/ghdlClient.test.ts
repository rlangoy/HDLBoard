// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GhdlClient } from './ghdlClient';
import type { VhdlFile } from './files';

/** Just enough of a WebSocket to see what `run` puts on the wire. */
class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static last: FakeSocket | undefined;
  readyState = FakeSocket.OPEN;
  readonly sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.last = this;
  }

  send(text: string): void {
    this.sent.push(text);
  }

  addEventListener(): void {}
  close(): void {}
}

const file = (name: string, folder: VhdlFile['folder']): VhdlFile => ({ id: name, name, folder, content: `// ${name}` });

const PROJECT: VhdlFile[] = [
  file('top.vhd', 'vhdl'),
  file('tb_top.vhd', 'work'),
  file('DE1_SoC.v', 'verilog'),
  file('defs.vh', 'verilog'),
];

const lastFrame = (): string => {
  const sent = FakeSocket.last?.sent ?? [];
  return sent[sent.length - 1] ?? '';
};

const sentNames = (): string[] =>
  lastFrame()
    .split('\n')
    .filter((line) => line.startsWith('@@FILE '))
    .map((line) => line.slice('@@FILE '.length, -'@@'.length));

function runWith(topFileName?: string): string {
  const client = new GhdlClient('ws://test', {
    onReady: vi.fn(),
    onState: vi.fn(),
    onLog: vi.fn(),
    onError: vi.fn(),
    onDone: vi.fn(),
    onClosed: vi.fn(),
  });
  client.run(PROJECT, topFileName);
  return lastFrame();
}

describe('GhdlClient.run', () => {
  beforeEach(() => {
    FakeSocket.last = undefined;
    vi.stubGlobal('WebSocket', FakeSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('K-6: with a Verilog top, only the verilog/ files are sent', () => {
    const frame = runWith('DE1_SoC.v');
    expect(frame.split('\n')[0]).toBe('RUN DE1_SoC.v');
    expect(sentNames()).toEqual(['DE1_SoC.v', 'defs.vh']);
  });

  test('K-7: with a VHDL top, only the vhdl/ files are sent', () => {
    runWith('top.vhd');
    expect(sentNames()).toEqual(['top.vhd']);
  });

  test('K-7: with no top marked, the vhdl/ files are sent as they always were', () => {
    const frame = runWith(undefined);
    expect(frame.split('\n')[0]).toBe('RUN');
    expect(sentNames()).toEqual(['top.vhd']);
  });
});
