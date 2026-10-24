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

import { bitsToString, type BitVector } from '../board';
import { patternToSegments, type SegmentVector } from '../SevenSegment';
import { sourceFolderFor } from './fileKinds';
import type { VhdlFile } from './files';
import type { RunWaveStatus, WaveFormat } from '../waveform/model';
import { BOARD_VERB, encodeBoardFrame } from '../../boards/boardFrame';
import type { BoardPorts } from '../../boards/types';

// 2: the BOARD frame (docs/board_io_config_spec.md § 8). HELLO's version is informational.
const PROTOCOL_VERSION = '2';
/** What a backend older than the BOARD frame answers it with: it then runs with the Default names. */
const UNKNOWN_BOARD_VERB = `Unknown verb: "${BOARD_VERB}"`;
const STATE_LENGTH = 10 + 6 * 7;

export interface HdlClientHandlers {
  onReady(): void;
  onState(ledr: BitVector, hex: SegmentVector[]): void;
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

/**
 * The backend's URL, on the page's own host — never a hardcoded `localhost`
 * (§ 6.4). With a `port` (dev: Vite on 5173, backend on 9010) it targets that
 * port; without one it is the page's own origin, for a reverse proxy that
 * forwards `/hdlsim` (Docker, Render). `wss:` on an `https:` page, since
 * browsers block a plain `ws:` socket from one.
 */
export function hdlBackendUrl(port?: number): string {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = port ? `${window.location.hostname}:${port}` : window.location.host;
  return `${scheme}://${host}/hdlsim`;
}

/**
 * An HTTP route on the same backend, e.g. its GitHub sign-in routes
 * (server/src/githubAuth.ts). Like hdlBackendUrl: without a `port`, the page's
 * own origin, where the reverse proxy forwards the route.
 */
export function hdlBackendHttpUrl(port: number | undefined, path: string): string {
  const host = port ? `${window.location.hostname}:${port}` : window.location.host;
  return `${window.location.protocol}//${host}${path}`;
}

/**
 * `STATE`'s 52-bit payload → the board's own value shapes. `HEX0` is
 * slice 0 (§ 6.4). Any bit that isn't `'0'`/`'1'` (`'X'`, GHDL's
 * undefined) coerces to that field's own *off* value (§ 8.4) — `0` for
 * `LEDR` (active high), `'1'` for a `HEX` segment (active low) — rather
 * than a tri-state `Bit`, per the plan's recommendation to ship the
 * simple version first.
 */
function parseState(bits: string): { ledr: BitVector; hex: SegmentVector[] } {
  const ledrField = bits.slice(0, 10);
  const ledr: BitVector = [...ledrField].reverse().map((c) => (c === '1' ? 1 : 0));

  const hex: SegmentVector[] = [];
  for (let i = 0; i < 6; i++) {
    const field = bits.slice(10 + i * 7, 10 + (i + 1) * 7);
    const coerced = [...field].map((c) => (c === '0' || c === '1' ? c : '1')).join('');
    hex.push(patternToSegments(coerced));
  }
  return { ledr, hex };
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
        break; // nothing to do — HELLO/WELCOME just confirms the version
      case 'READY':
        this.everReady = true;
        this.handlers.onReady();
        break;
      case 'STATE':
        if (inline.length === STATE_LENGTH) {
          const { ledr, hex } = parseState(inline);
          this.handlers.onState(ledr, hex);
        }
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
      // WAVE goes right before the RUN it is for (docs/waveform_viewer_spec.md § 7.1).
      ws.send(`WAVE ${recordWave ? 'on' : 'off'}`);
      // BOARD too: settings for the next run, sent before every RUN, so a reconnect needs no state.
      if (this.backendKnowsBoard) ws.send(encodeBoardFrame(board));
      ws.send(`${head}\n${body}`);
    };
    // Still connecting: `onopen` (ensureSocket) sends HELLO first, then this listener sends RUN.
    if (ws.readyState === WebSocket.OPEN) send();
    else ws.addEventListener('open', send, { once: true });
  }

  stim(sw: BitVector, key: BitVector): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(`STIM ${bitsToString(sw)}${bitsToString(key)}`);
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
