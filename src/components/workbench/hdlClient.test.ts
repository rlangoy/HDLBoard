// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HdlClient } from './hdlClient';
import type { VhdlFile } from './files';
import { builtInBoard, DEFAULT_BOARD } from '../../boards/boardCatalog';
import { encodeBoardFrame, encodeV1BoardFrame } from '../../boards/boardFrame';
import { BOARD_TEXT } from './boardText';

const DE1_SOC = builtInBoard('de1-soc');

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

  /** A text frame from the server. */
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

/** What a backend of this release answers HELLO with; a run waits for it. */
const WELCOME_CURRENT = 'WELCOME 3';

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
    onError: vi.fn(),
    onDone: vi.fn(),
    onClosed: vi.fn(),
  };
}

function runWith(topFileName?: string, runTarget?: string | null): string {
  const client = new HdlClient('ws://test', recordingHandlers());
  client.run(PROJECT, topFileName, runTarget ?? null, false, DEFAULT_BOARD.ports);
  FakeSocket.last?.receive(WELCOME_CURRENT);
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
    FakeSocket.last?.receive(WELCOME_CURRENT);
    const verbs = (FakeSocket.last?.sent ?? []).map((frame) => frame.split(/\s/)[0]);
    expect(verbs).toEqual(['HELLO', 'WAVE', 'BOARD', 'RUN']);
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

describe('HdlClient and waveforms (docs/waveform_viewer_spec.md § 7.4)', () => {
  beforeEach(() => {
    FakeSocket.last = undefined;
    FakeSocket.initialState = FakeSocket.OPEN;
    vi.stubGlobal('WebSocket', FakeSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const waveHandlers = () => ({ onReady: vi.fn(), onBegin: vi.fn(), onChunk: vi.fn(), onEnd: vi.fn(), onNone: vi.fn() });

  test('WAVE on/off and the board go right before every RUN', () => {
    const client = new HdlClient('ws://test', recordingHandlers());
    client.run(PROJECT, 'top.vhd', null, true, DE1_SOC.ports);
    FakeSocket.last?.receive(WELCOME_CURRENT);
    const sent = FakeSocket.last?.sent ?? [];
    expect(sent.slice(-3, -1)).toEqual(['WAVE on', encodeBoardFrame(DE1_SOC.ports)]);
    client.run(PROJECT, 'top.vhd', null, false, DEFAULT_BOARD.ports);
    expect(sent.slice(-3, -1)).toEqual(['WAVE off', encodeBoardFrame(DEFAULT_BOARD.ports)]);
  });

  test('the WAVE frames reach their handlers; binary frames only inside a transfer', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wave = waveHandlers();
    const client = new HdlClient('ws://test', { ...recordingHandlers(), wave });
    client.run(PROJECT, 'top.vhd', null, true, DEFAULT_BOARD.ports);
    const socket = FakeSocket.last;
    if (socket === undefined) throw new Error('no socket was opened');
    socket.receive('WAVE-READY 3 ghw 2420 complete');
    expect(wave.onReady).toHaveBeenCalledWith({ run: 3, format: 'ghw', bytes: 2420, status: 'complete' });
    socket.onmessage?.({ data: new ArrayBuffer(4) });
    expect(wave.onChunk).not.toHaveBeenCalled();
    socket.receive('WAVE-BEGIN 3 2420');
    socket.onmessage?.({ data: new ArrayBuffer(4) });
    socket.receive('WAVE-END 3');
    socket.onmessage?.({ data: new ArrayBuffer(4) });
    expect(wave.onBegin).toHaveBeenCalledWith(3, 2420);
    expect(wave.onChunk).toHaveBeenCalledOnce();
    expect(wave.onEnd).toHaveBeenCalledWith(3);
    socket.receive('WAVE-NONE 2');
    expect(wave.onNone).toHaveBeenCalledWith(2);
    socket.receive('WAVE-READY 3 fst 1 complete');
    expect(wave.onReady).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledTimes(3);
    client.waveGet(3);
    expect(socket.sent[socket.sent.length - 1]).toBe('WAVE-GET 3');
  });
});

describe('HdlClient and an older backend (docs/board_io_config_spec.md § 6.5)', () => {
  beforeEach(() => {
    FakeSocket.last = undefined;
    FakeSocket.initialState = FakeSocket.OPEN;
    vi.stubGlobal('WebSocket', FakeSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const OLD_BACKEND_ANSWER = 'ERROR protocol\nUnknown verb: "BOARD"';

  test('says so once, sends no more BOARD frames, and does not report the answer as an error', () => {
    const handlers = { ...recordingHandlers(), onOldBackend: vi.fn() };
    const client = new HdlClient('ws://test', handlers);
    client.run(PROJECT, 'top.vhd', null, false, DE1_SOC.ports);
    const socket = FakeSocket.last!;
    socket.receive('WELCOME 1');
    socket.receive(OLD_BACKEND_ANSWER);
    client.run(PROJECT, 'top.vhd', null, false, DE1_SOC.ports);
    socket.receive(OLD_BACKEND_ANSWER);

    expect(handlers.onOldBackend).toHaveBeenCalledTimes(1);
    expect(handlers.onError).not.toHaveBeenCalled();
    expect(socket.sent.filter((frame) => frame.startsWith('BOARD'))).toHaveLength(1);
  });

  test('a protocol-2 backend gets the 1.6 frame for a board of the Default shape (§ 6.3)', () => {
    const client = new HdlClient('ws://test', recordingHandlers());
    client.run(PROJECT, 'top.vhd', null, false, DE1_SOC.ports);
    const socket = FakeSocket.last!;
    socket.receive('WELCOME 2');
    expect(socket.sent).toContain(encodeV1BoardFrame(DE1_SOC.ports));
    expect(socket.sent[socket.sent.length - 1].startsWith('RUN')).toBe(true);
  });

  test('a protocol-2 backend runs no board of another shape, and says why', () => {
    const handlers = recordingHandlers();
    new HdlClient('ws://test', handlers).run(PROJECT, 'top.vhd', null, false, builtInBoard('basys3').ports);
    const socket = FakeSocket.last!;
    socket.receive('WELCOME 2');
    expect(socket.sent.filter((frame) => frame.startsWith('RUN') || frame.startsWith('BOARD'))).toEqual([]);
    expect(handlers.onError).toHaveBeenCalledWith('protocol', BOARD_TEXT.oldBackendShape);
    expect(BOARD_TEXT.oldBackendShape).toContain('10 switches, 4 keys and 6 displays');
  });

  test('a run waits for WELCOME, and sends nothing before it', () => {
    new HdlClient('ws://test', recordingHandlers()).run(PROJECT, 'top.vhd', null, false, DEFAULT_BOARD.ports);
    const socket = FakeSocket.last!;
    expect(socket.sent).toEqual([]);
    socket.receive(WELCOME_CURRENT);
    expect(socket.sent).toContain(encodeBoardFrame(DEFAULT_BOARD.ports));
  });

  test('still reports any other protocol error', () => {
    const handlers = recordingHandlers();
    new HdlClient('ws://test', handlers).run(PROJECT, 'top.vhd', null, false, DEFAULT_BOARD.ports);
    FakeSocket.last!.receive('ERROR protocol\nRUN refused: the last BOARD frame was not valid.');
    expect(handlers.onError).toHaveBeenCalledWith('protocol', 'RUN refused: the last BOARD frame was not valid.');
  });
});
