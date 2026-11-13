// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * One student's WebSocket connection: its session, its bounded output, its message
 * budgets, and what each frame it sends does. The server (server.ts) keeps the registry
 * of these and chooses which one makes room for a newcomer; a connection ends itself
 * through `end()` and tells the server through `onEnded`.
 */

import type { RawData, WebSocket } from 'ws';
import { decodeClientFrame, encodeServerFrame, type ClientFrame, type ServerFrame } from './protocol.js';
import { Session } from './session.js';
import type { Newcomer, OpenSession } from './sessionLimit.js';
import { SocketOutput } from './socketOutput.js';
import { MS_PER_SECOND } from './timeUnits.js';
import {
  MessageBudget,
  TOO_MANY_DOWNLOADS_TEXT,
  TOO_MANY_MESSAGES_TEXT,
  TOO_MANY_RESETS_TEXT,
  TOO_MANY_RUNS_LOG_LINE,
  TOO_MANY_RUNS_TEXT,
  type WsLimits,
} from './wsLimits.js';

// 2: the BOARD frame (docs/board_io_config_spec.md § 8). HELLO's version stays
// informational: any version a client names is accepted, and answered with this one.
// 3: board shapes — a JSON BOARD body, STIM and STATE lengths per board
// (docs/board_io_v2_spec.md § 6). A version-2 client's line body is still accepted.
// 4: timed STIM steps, `STIM <bits>/<holdNs> … <bits>` — a bouncing pushbutton.
// 5: `ERROR busy` — the server is full; this connection was refused, or closed for a new one.
// 6: `OPTIONS` — the project's compiler options (compilerOptions.ts), sent before RUN.
const PROTOCOL_VERSION = '6';
/**
 * How long a socket told to go gets to close before it is cut. A proxy may hold the close
 * frame back (Render's did: the tab kept a dead socket open), and cutting the connection
 * ends it there too.
 */
export const CLOSE_GRACE_MS = MS_PER_SECOND;
/** RFC 6455's "Try Again Later": the server is full, or this connection ran too often. */
const CLOSE_TRY_AGAIN_LATER = 1013;
/** RFC 6455's "Policy Violation": a client over its message budget. */
const CLOSE_POLICY_VIOLATION = 1008;

/** What a connection needs from the server. */
export interface ConnectionContext {
  readonly limits: WsLimits;
  /** The clock sessions' ages are measured on, in ms. */
  readonly now: () => number;
  /** The clock budgets refill on, in ms; never jumps. */
  readonly monotonicNow: () => number;
  /** Called once, when the connection has ended, whichever side ended it. */
  readonly onEnded: (connection: ClientConnection) => void;
}

/** An open socket and what it sends through. */
interface Peer {
  readonly ws: WebSocket;
  readonly output: SocketOutput;
}

type Handler<Frame> = (frame: Frame) => void;
/** One handler per client verb; a verb without one does not compile. */
type FrameHandlers = { readonly [Verb in ClientFrame['verb']]: Handler<Extract<ClientFrame, { verb: Verb }>> };

/** A message's size, whichever of its forms `ws` hands it over in. */
function byteLength(data: RawData): number {
  return Array.isArray(data) ? data.reduce((sum, chunk) => sum + chunk.length, 0) : data.byteLength;
}

/**
 * A failure only cuts the socket: its `close` then ends the connection, after whatever
 * session method was sending has returned. Ending it inside that method would let the
 * method go on to start timers on a destroyed session.
 */
function boundedOutput(ws: WebSocket, limits: WsLimits): SocketOutput {
  return new SocketOutput({
    socket: ws,
    limits,
    onFailure: (reason) => {
      console.warn(`hdl-board: closed WebSocket: ${reason}`);
      ws.terminate();
    },
  });
}

/** Logs it, tells the peer why (`ERROR busy`), then closes — and cuts, if the close is held up. */
function closeBusy(peer: Peer, text: string, logLine: string): void {
  console.log(logLine);
  peer.output.send(encodeServerFrame({ verb: 'ERROR', stage: 'busy', text }));
  peer.output.dispose();
  peer.ws.close(CLOSE_TRY_AGAIN_LATER, 'server busy');
  setTimeout(() => peer.ws.terminate(), CLOSE_GRACE_MS).unref();
}

/** Refuses a socket that got no place, before any session is made for it. */
export function refuseBusy(ws: WebSocket, limits: WsLimits, reason: { text: string; logLine: string }): void {
  // An error while the close is in progress must not go unheard: that would end the process.
  ws.on('error', () => {});
  closeBusy({ ws, output: boundedOutput(ws, limits) }, reason.text, reason.logLine);
}

export class ClientConnection implements OpenSession, Peer {
  readonly output: SocketOutput;
  readonly openedAt: number;
  readonly clientAddress: string;
  private readonly session: Session;
  private readonly budget: MessageBudget;
  private helloed = false;
  private ended = false;

  private readonly handlers: FrameHandlers = {
    HELLO: () => this.hello(),
    RUN: (frame) => this.run(frame),
    STIM: (frame) => this.session.handleStim(frame.steps),
    WAVE: (frame) => this.session.handleWave(frame.on),
    // An invalid board is reported once, by the RUN that follows it (session.ts).
    BOARD: (frame) => this.session.handleBoard(frame.board),
    // Invalid options too: the RUN that follows says why.
    OPTIONS: (frame) => this.session.handleOptions(frame.options),
    'WAVE-GET': (frame) => this.waveGet(frame.run),
    RESET: () => this.reset(),
    STOP: () => this.session.handleStop(),
    PING: () => this.send({ verb: 'PONG' }),
  };

  constructor(
    readonly ws: WebSocket,
    newcomer: Newcomer,
    private readonly context: ConnectionContext,
  ) {
    this.openedAt = newcomer.at;
    this.clientAddress = newcomer.clientAddress;
    this.output = boundedOutput(ws, context.limits);
    const sendBinary = (chunk: Buffer) => this.output.sendBinary(chunk);
    this.session = new Session((frame) => this.send(frame), undefined, { sendBinary, now: context.now });
    this.budget = new MessageBudget(context.limits, context.monotonicNow);
    ws.on('message', (data, isBinary) => this.onMessage(data, isBinary));
    ws.on('ping', (data) => this.onPing(data));
    ws.on('pong', (data) => this.onPong(data));
    ws.on('close', () => this.end());
    ws.on('error', () => this.end());
  }

  get simulating(): boolean {
    return this.session.simulating;
  }

  get idleSince(): number {
    return this.session.idleSince;
  }

  /** Ends the session and its output, once. The socket's own close is not waited for. */
  end(): void {
    if (this.ended) return;
    this.ended = true;
    this.output.dispose();
    this.session.destroy();
    this.context.onEnded(this);
  }

  /** Tells the student why (`ERROR busy`), closes the socket and ends: the place is free at once. */
  closeBusy(text: string, logLine: string): void {
    closeBusy(this, text, logLine);
    this.end();
  }

  private send(frame: ServerFrame): void {
    this.output.send(encodeServerFrame(frame));
  }

  private onPing(data: Buffer): void {
    if (this.ended) return;
    if (this.budget.takeMessage(data.length)) this.output.pong(data);
    else this.closeForFlooding();
  }

  private onPong(data: Buffer): void {
    if (!this.ended && !this.budget.takeMessage(data.length)) this.closeForFlooding();
  }

  private onMessage(data: RawData, isBinary: boolean): void {
    // Ended to make room for another, it is only waiting for its socket to close.
    if (this.ended) return;
    if (!this.budget.takeMessage(byteLength(data))) return this.closeForFlooding();
    if (isBinary) return this.refuseBinary();
    const frame = decodeClientFrame(data.toString('utf8'));
    if ('message' in frame) return this.send({ verb: 'ERROR', stage: 'protocol', text: frame.message });
    this.handle(frame);
  }

  /** `handlers` is keyed by verb, so `frame` is the one its handler takes; TypeScript cannot see that across the union. */
  private handle(frame: ClientFrame): void {
    const handler = this.handlers[frame.verb] as Handler<ClientFrame>;
    handler(frame);
  }

  private refuseBinary(): void {
    // Binary frames only ever go to the client, with a waveform (docs/waveform_viewer_spec.md § 7.4).
    this.send({ verb: 'ERROR', stage: 'protocol', text: 'A client sends no binary frames.' });
    this.ws.close();
  }

  private hello(): void {
    this.helloed = true;
    this.send({ verb: 'WELCOME', version: PROTOCOL_VERSION });
  }

  private run(frame: Extract<ClientFrame, { verb: 'RUN' }>): void {
    if (!this.helloed) return this.send({ verb: 'ERROR', stage: 'protocol', text: 'RUN sent before HELLO.' });
    // A RUN over the work budget ends like one on a full server, so the page lets go of the run.
    if (!this.budget.takeWork()) return this.closeBusy(TOO_MANY_RUNS_TEXT, TOO_MANY_RUNS_LOG_LINE);
    this.session.handleRun(frame.files, frame.topFile, frame.runTarget).catch((e) => {
      this.send({ verb: 'ERROR', stage: 'internal', text: `Internal server error:\n${String(e)}` });
    });
  }

  /** Over the download budget, the page is still answered (`WAVE-NONE`), so it never waits for frames. */
  private waveGet(run: number): void {
    if (this.budget.takeDownload()) return void this.session.handleWaveGet(run);
    this.send({ verb: 'ERROR', stage: 'protocol', text: TOO_MANY_DOWNLOADS_TEXT });
    this.send({ verb: 'WAVE-NONE', run });
  }

  private reset(): void {
    // The page does not wait for an answer to RESET, so one over the budget is only refused.
    if (this.budget.takeWork()) this.session.handleReset();
    else this.send({ verb: 'ERROR', stage: 'protocol', text: TOO_MANY_RESETS_TEXT });
  }

  /** Over its frame or byte budget: told why, ended, closed. */
  private closeForFlooding(): void {
    console.warn('hdl-board: closed WebSocket: message rate limit');
    this.send({ verb: 'ERROR', stage: 'protocol', text: TOO_MANY_MESSAGES_TEXT });
    this.end();
    this.ws.close(CLOSE_POLICY_VIOLATION, 'rate limit exceeded');
    setTimeout(() => this.ws.terminate(), CLOSE_GRACE_MS).unref();
  }
}
