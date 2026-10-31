// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The Workbench's WebSocket client for the simulation backend, which runs
 * GHDL or Icarus Verilog behind one endpoint —
 * ../../../docs/ghdl_implementation_plan.md § 6, § 8.2. The only file in this
 * app that speaks the wire protocol; `Workbench.tsx` calls this, never
 * `WebSocket` directly.
 *
 * Mirrors server/src/protocol.ts's grammar independently (a separate npm
 * package, in the browser, cannot import that file) — keep the two in
 * sync by hand if the protocol changes.
 */

import { sourceFolderFor } from './fileKinds';
import type { VhdlFile } from './files';
import type { RunWaveStatus, WaveFormat } from '../waveform/model';
import { BOARD_VERB, encodeBoardFrame, encodeV1BoardFrame, fitsV1BoardFrame } from '../../boards/boardFrame';
import type { BoardPorts } from '../../boards/types';
import { BOARD_TEXT } from './boardText';
import type { TimedStim } from './bouncyButtons';

/** `<bits>`, or `<bits>/<holdNs>` for a step that holds a set time. */
function stimStepText({ bits, holdNs }: TimedStim): string {
  return holdNs === undefined ? bits : `${bits}/${holdNs}`;
}

// 3: board shapes, a JSON BOARD body and STIM/STATE lengths per board (docs/board_io_v2_spec.md § 6).
// 4: timed STIM steps, `STIM <bits>/<holdNs> … <bits>` — a bouncing pushbutton.
const PROTOCOL_VERSION = '4';
/** The first protocol whose BOARD frame carries a board's shape; an older backend gets the 1.6 frame. */
const SHAPED_BOARD_PROTOCOL = 3;
/** The first protocol that takes timed STIM steps; an older backend gets the final state alone. */
const TIMED_STIM_PROTOCOL = 4;
/** A backend that answers WELCOME without a number is the oldest one. */
const OLDEST_PROTOCOL = 1;
/** What a backend older than the BOARD frame answers it with: it then runs with the Default names. */
const UNKNOWN_BOARD_VERB = `Unknown verb: "${BOARD_VERB}"`;

export interface HdlClientHandlers {
  onReady(): void;
  /** `STATE`'s payload as sent; `decodeState` reads it for the active board. */
  onState(bits: string): void;
  onLog(text: string): void;
  onError(stage: string, text: string): void;
  onDone(reason: string): void;
  onClosed(): void;
  /**
   * The backend does not know the BOARD frame, so it simulates with the Default names.
   * Called once per connection; no more BOARD frames are sent on it.
   */
  onOldBackend?(): void;
  /** The waveform frames (docs/waveform_viewer_spec.md § 7.4); omitted, they are ignored. */
  wave?: WaveClientHandlers;
}

/** `WAVE-READY <run> <format> <bytes> <status>`: a run wrote a waveform. */
export interface WaveReady {
  readonly run: number;
  readonly format: WaveFormat;
  readonly bytes: number;
  readonly status: RunWaveStatus;
}

export interface WaveClientHandlers {
  onReady(ready: WaveReady): void;
  /** The transfer of `run` starts; `bytes` is the file's uncompressed size. */
  onBegin(run: number, bytes: number): void;
  /** One binary frame of gzip data, between `onBegin` and `onEnd`. */
  onChunk(chunk: ArrayBuffer): void;
  onEnd(run: number): void;
  /** That run's waveform is not available, or its transfer stopped. */
  onNone(run: number): void;
}

const WAVE_FORMATS: readonly string[] = ['ghw', 'vcd'];
const WAVE_STATUSES: readonly string[] = ['complete', 'stopped', 'timeout', 'size-limit'];
const RUN_NUMBER = /^\d{1,15}$/;

/** `WAVE-READY`'s inline arguments, or undefined when they are malformed. */
export function parseWaveReady(inline: string): WaveReady | undefined {
  const [run = '', format = '', bytes = '', status = ''] = inline.split(' ');
  if (!RUN_NUMBER.test(run) || !RUN_NUMBER.test(bytes)) return undefined;
  if (!WAVE_FORMATS.includes(format) || !WAVE_STATUSES.includes(status)) return undefined;
  return { run: Number(run), format: format as WaveFormat, bytes: Number(bytes), status: status as RunWaveStatus };
}

/** `ws://<page host>:<port>/hdlsim` — never a hardcoded `localhost` (§ 6.4). */
export function hdlBackendUrl(port: number): string {
  return `ws://${window.location.hostname}:${port}/hdlsim`;
}

/** An HTTP route on the same backend, e.g. its GitHub sign-in routes (server/src/githubAuth.ts). */
export function hdlBackendHttpUrl(port: number, path: string): string {
  return `${window.location.protocol}//${window.location.hostname}:${port}${path}`;
}

/**
 * The files one run sends: those in the folder of the top file (`sourceFolderFor`:
 * `verilog/` for a Verilog top, `vhdl/` otherwise). A `work/` testbench run from the
 * TB pane is the top itself, so it goes too — every other `work/` file stays out
 * (docs/impl_split_screen.md D21). Shared by `HdlClient.run` and the diagnostics
 * snapshot, so the snapshot is exactly what was uploaded.
 */
export function filesForRun(files: readonly VhdlFile[], topFileName?: string): VhdlFile[] {
  const top = files.find((f) => f.name === topFileName);
  const folder = sourceFolderFor(top);
  return files.filter((f) => f.folder === folder || (f === top && f.folder === 'work'));
}

/** `RUN`'s head line: `RUN <top> [@<unit>]` (D20); keep in step with server/src/protocol.ts. */
export function runHeader(topFileName?: string, runTarget?: string | null): string {
  if (!topFileName) return 'RUN';
  return runTarget ? `RUN ${topFileName} @${runTarget}` : `RUN ${topFileName}`;
}

export class HdlClient {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private readonly handlers: HdlClientHandlers;
  // Whether the current socket has ever received READY. A close before
  // that happens means the backend was never actually reached — a plain
  // `onClosed()` there is indistinguishable from a normal Stop, and the
  // Workbench console would show nothing at all (found by actually
  // stopping the backend and clicking Start, not by reading this code:
  // the failure is a same-tick connection refusal, not a slow timeout —
  // near-instant on localhost, and silent without this).
  private everReady = false;
  // Binary frames are only valid between WAVE-BEGIN and WAVE-END (waveform spec § 7.4).
  private waveTransfer = false;
  // False once this connection's backend has said it does not know BOARD (an older backend).
  private backendKnowsBoard = true;
  // The protocol the backend named in WELCOME; undefined until it has answered HELLO.
  private backendVersion: number | undefined;
  // What waits for WELCOME: a run's frames depend on the backend's version (§ 6.3).
  private afterWelcome: Array<() => void> = [];

  constructor(url: string, handlers: HdlClientHandlers) {
    this.url = url;
    this.handlers = handlers;
  }

  private ensureSocket(): WebSocket {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return this.ws;
    }
    this.everReady = false;
    this.backendKnowsBoard = true;
    this.backendVersion = undefined;
    this.afterWelcome = [];
    const ws = new WebSocket(this.url);
    // Waveform content arrives as binary frames; an ArrayBuffer goes straight to the worker.
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      ws.send(`HELLO ${PROTOCOL_VERSION}`);
    };
    ws.onmessage = (event) => {
      if (typeof event.data === 'string') this.handleFrame(event.data);
      else this.handleBinary(event.data);
    };
    ws.onclose = () => {
      if (!this.everReady) {
        this.handlers.onError('internal', `Could not reach the simulation backend at ${this.url}.`);
      }
      this.handlers.onClosed();
    };
    ws.onerror = () => {
      // onclose fires right after in every browser; nothing extra to do here.
    };
    this.ws = ws;
    return ws;
  }

  private handleFrame(text: string): void {
    const nl = text.indexOf('\n');
    const head = nl === -1 ? text : text.slice(0, nl);
    const body = nl === -1 ? '' : text.slice(nl + 1);
    const sp = head.indexOf(' ');
    const verb = sp === -1 ? head : head.slice(0, sp);
    const inline = sp === -1 ? '' : head.slice(sp + 1);

    switch (verb) {
      case 'WELCOME':
        this.welcome(inline);
        break;
      case 'READY':
        this.everReady = true;
        this.handlers.onReady();
        break;
      case 'STATE':
        this.handlers.onState(inline);
        break;
      case 'LOG':
        this.handlers.onLog(body);
        break;
      case 'ERROR':
        if (this.isOldBackendAnswer(inline, body)) this.noteOldBackend();
        else this.handlers.onError(inline, body);
        break;
      case 'DONE':
        this.handlers.onDone(inline);
        break;
      case 'WAVE-READY':
      case 'WAVE-BEGIN':
      case 'WAVE-END':
      case 'WAVE-NONE':
        this.handleWaveFrame(verb, inline);
        break;
      case 'PONG':
        break;
      default:
        // Unknown verb: ignore, per § 6.2 — never disconnect on this.
        break;
    }
  }

  private welcome(version: string): void {
    this.backendVersion = Number.parseInt(version, 10) || OLDEST_PROTOCOL;
    const waiting = this.afterWelcome;
    this.afterWelcome = [];
    for (const action of waiting) action();
  }

  private whenWelcomed(action: () => void): void {
    if (this.backendVersion === undefined) this.afterWelcome.push(action);
    else action();
  }

  /**
   * The BOARD frame this backend understands: the JSON frame from protocol 3, the 1.6
   * frame before it, which only a board of the Default shape at 50 MHz fits — undefined for any
   * other board (§ 6.3).
   */
  private boardFrameFor(board: BoardPorts): string | undefined {
    if ((this.backendVersion ?? OLDEST_PROTOCOL) >= SHAPED_BOARD_PROTOCOL) return encodeBoardFrame(board);
    return fitsV1BoardFrame(board) ? encodeV1BoardFrame(board) : undefined;
  }

  /** `ERROR protocol` about the BOARD verb: the backend predates it, and the RUN that follows still runs. */
  private isOldBackendAnswer(stage: string, text: string): boolean {
    return stage === 'protocol' && text.includes(UNKNOWN_BOARD_VERB);
  }

  private noteOldBackend(): void {
    if (!this.backendKnowsBoard) return;
    this.backendKnowsBoard = false;
    this.handlers.onOldBackend?.();
  }

  private handleBinary(data: unknown): void {
    if (!(data instanceof ArrayBuffer) || !this.waveTransfer) {
      console.warn('HdlClient: dropped a binary frame outside a waveform transfer');
      return;
    }
    this.handlers.wave?.onChunk(data);
  }

  private handleWaveFrame(verb: string, inline: string): void {
    const wave = this.handlers.wave;
    if (verb === 'WAVE-READY') {
      const ready = parseWaveReady(inline);
      if (ready === undefined) console.warn(`HdlClient: dropped a malformed WAVE-READY: ${JSON.stringify(inline)}`);
      else wave?.onReady(ready);
      return;
    }
    const [runText = '', bytesText = '0'] = inline.split(' ');
    if (!RUN_NUMBER.test(runText)) return;
    const run = Number(runText);
    this.waveTransfer = verb === 'WAVE-BEGIN';
    if (verb === 'WAVE-BEGIN') wave?.onBegin(run, Number(bytesText));
    else if (verb === 'WAVE-END') wave?.onEnd(run);
    else wave?.onNone(run);
  }

  /**
   * Sends the files of one design folder — the folder of the top file
   * (`sourceFolderFor`: `verilog/` for a Verilog top, `vhdl/` otherwise) —
   * as the `@@FILE ...@@`-framed body (§ 6.3). The backend picks its
   * simulator from the top file's extension. `topFileName`, when given
   * (the file currently marked as top in the Files panel), is sent as
   * `RUN`'s inline arg so the backend elaborates that file's design
   * rather than guessing from board-port matches — see `portDetect.ts`'s
   * `findTopEntity`. `board`'s port names go in a BOARD frame just before the RUN.
   */
  run(files: VhdlFile[], topFileName: string | undefined, runTarget: string | null, recordWave: boolean, board: BoardPorts): void {
    const ws = this.ensureSocket();
    const sourceFiles = filesForRun(files, topFileName);
    const body = sourceFiles.map((f) => `@@FILE ${f.name}@@\n${f.content}`).join('\n');
    const head = runHeader(topFileName, runTarget);
    const send = () => {
      const boardFrame = this.boardFrameFor(board);
      if (boardFrame === undefined) {
        this.handlers.onError('protocol', BOARD_TEXT.oldBackendShape);
        return;
      }
      // WAVE goes right before the RUN it is for (docs/waveform_viewer_spec.md § 7.1).
      ws.send(`WAVE ${recordWave ? 'on' : 'off'}`);
      // BOARD too: settings for the next run, sent before every RUN, so a reconnect needs no state.
      if (this.backendKnowsBoard) ws.send(boardFrame);
      ws.send(`${head}\n${body}`);
    };
    // Still connecting: `onopen` (ensureSocket) sends HELLO first; the run waits for WELCOME.
    if (ws.readyState === WebSocket.OPEN) this.whenWelcomed(send);
    else ws.addEventListener('open', () => this.whenWelcomed(send), { once: true });
  }

  /** Sends a `STIM` payload, as `encodeStim` writes it for the active board. */
  stim(bits: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(`STIM ${bits}`);
  }

  /**
   * Sends timed steps — a bouncing button — as one `STIM`, so the backend has them all
   * before the first is applied. A backend older than protocol 4 gets the last state alone.
   */
  stimSteps(steps: readonly TimedStim[]): void {
    const last = steps[steps.length - 1];
    if (last === undefined) return;
    if ((this.backendVersion ?? OLDEST_PROTOCOL) < TIMED_STIM_PROTOCOL) {
      this.stim(last.bits);
      return;
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(`STIM ${steps.map(stimStepText).join(' ')}`);
  }

  /** Asks for the waveform of `run` (`WAVE-GET`); it arrives through `handlers.wave`. */
  waveGet(run: number): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(`WAVE-GET ${run}`);
  }

  reset(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send('RESET');
  }

  stop(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send('STOP');
  }

  close(): void {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }
}
