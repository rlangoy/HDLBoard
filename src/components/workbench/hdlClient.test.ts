// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HdlClient, type RunPlugins } from './hdlClient';
import type { VhdlFile } from './files';

/** Just enough of a WebSocket to see what `run` puts on the wire. */
class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static last: FakeSocket | undefined;
  /** What a new socket starts as; a test sets CONNECTING to see what waits for `open`. */
  static initialState = FakeSocket.OPEN;
  readyState = FakeSocket.initialState;
  readonly sent: string[] = [];
  private readonly openListeners: Array<() => void> = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.last = this;
  }

  send(text: string): void {
    this.sent.push(text);
  }

  addEventListener(type: string, listener: () => void): void {
    if (type === 'open') this.openListeners.push(listener);
  }

  close(): void {}

  /** A frame from the server. */
  receive(text: string): void {
    this.onmessage?.({ data: text });
  }

  /** Completes the connection the way a browser does: the `onopen` handler, then the listeners. */
  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
    for (const listener of this.openListeners) listener();
  }
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

function recordingHandlers() {
  return {
    onReady: vi.fn(),
    onState: vi.fn(),
    onLog: vi.fn(),
    onPlugin: vi.fn(),
    onError: vi.fn(),
    onDone: vi.fn(),
    onClosed: vi.fn(),
  };
}

function runWith(topFileName?: string, runTarget?: string | null, plugins?: RunPlugins): string {
  const client = new HdlClient('ws://test', recordingHandlers());
  client.run(PROJECT, topFileName, runTarget, plugins);
  return lastFrame();
}

describe('HdlClient.run', () => {
  beforeEach(() => {
    FakeSocket.last = undefined;
    FakeSocket.initialState = FakeSocket.OPEN;
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

  test('a run started while connecting sends HELLO once, then RUN', () => {
    FakeSocket.initialState = FakeSocket.CONNECTING;
    runWith('top.vhd');
    FakeSocket.last?.open();
    const verbs = (FakeSocket.last?.sent ?? []).map((frame) => frame.split(/\s/)[0]);
    expect(verbs).toEqual(['HELLO', 'RUN']);
  });

  test('R-1 / AC-6: no run target, the header is exactly as before', () => {
    expect(runWith('top.vhd', null).split('\n')[0]).toBe('RUN top.vhd');
  });

  test('R-2: a run target is sent as RUN <file> @<unit>', () => {
    expect(runWith('top.vhd', 'top_tb').split('\n')[0]).toBe('RUN top.vhd @top_tb');
  });

  test('R-4 / D21: a work/ testbench as top is sent with the vhdl/ files, and no other work/ file', () => {
    expect(runWith('tb_top.vhd', 'top_tb').split('\n')[0]).toBe('RUN tb_top.vhd @top_tb');
    expect(sentNames()).toEqual(['top.vhd', 'tb_top.vhd']);
  });
});

describe('HdlClient plugins', () => {
  beforeEach(() => {
    FakeSocket.last = undefined;
    FakeSocket.initialState = FakeSocket.OPEN;
    vi.stubGlobal('WebSocket', FakeSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const PLUGINS: RunPlugins = { enabledIds: ['rs232'], files: [{ name: 'hdlboard/uart_monitor.vhd', content: '-- edited' }] };

  test('PLUGINS goes out before RUN, and the plugin files after the project files', () => {
    runWith('top.vhd', null, PLUGINS);
    const sent = FakeSocket.last?.sent ?? [];
    expect(sent[sent.length - 2]).toBe('PLUGINS rs232');
    expect(sentNames()).toEqual(['top.vhd', 'hdlboard/uart_monitor.vhd']);
  });

  test('no plugins given: no PLUGINS, and only the project files', () => {
    runWith('top.vhd');
    expect((FakeSocket.last?.sent ?? []).some((frame) => frame.startsWith('PLUGINS'))).toBe(false);
    expect(sentNames()).toEqual(['top.vhd']);
  });

  test('an empty plugin set is sent as PLUGINS with no ids', () => {
    runWith('top.vhd', null, { enabledIds: [], files: [] });
    const sent = FakeSocket.last?.sent ?? [];
    expect(sent[sent.length - 2]).toBe('PLUGINS ');
  });

  test('a PLUGIN frame after READY reaches onPlugin', () => {
    const handlers = recordingHandlers();
    new HdlClient('ws://test', handlers).run(PROJECT, 'top.vhd');
    FakeSocket.last?.receive('READY');
    FakeSocket.last?.receive('PLUGIN uart TX 83495\n48');
    expect(handlers.onPlugin).toHaveBeenCalledWith({ kind: 'uart', instance: 'TX', timeNs: 83495, payload: '48' });
  });

  test('a PLUGIN frame before READY is dropped with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handlers = recordingHandlers();
    new HdlClient('ws://test', handlers).run(PROJECT, 'top.vhd');
    FakeSocket.last?.receive('PLUGIN uart TX 1\n48');
    expect(handlers.onPlugin).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });

  test('a malformed PLUGIN frame is dropped with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handlers = recordingHandlers();
    new HdlClient('ws://test', handlers).run(PROJECT, 'top.vhd');
    FakeSocket.last?.receive('READY');
    FakeSocket.last?.receive('PLUGIN uart TX\n48');
    expect(handlers.onPlugin).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });
});
