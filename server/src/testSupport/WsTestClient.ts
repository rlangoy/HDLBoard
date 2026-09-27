// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * A raw protocol client for integration tests: connects to the real backend over a
 * real WebSocket and speaks the wire protocol of docs/ghdl_implementation_plan.md
 * § 6, using the backend's own `protocol.ts` to encode and decode.
 *
 * Every frame received is kept in `frames`. `until` waits for a frame matching a
 * predicate and *consumes* everything up to and including it, so consecutive waits
 * see consecutive frames rather than the same one twice.
 */

import { WebSocket } from 'ws';
import {
  decodeServerFrame,
  encodeClientFrame,
  type ClientFrame,
  type ServerFrame,
  type VhdlFileInput,
} from '../protocol.js';
import { normalizeState, type BoardState } from './boardState.js';

const PROTOCOL_VERSION = '1';
const BACKEND_PATH = '/ghdlsim';
const DEFAULT_WAIT_MS = 10_000;

type FramePredicate = (frame: ServerFrame) => boolean;

export class WsTestClient {
  readonly frames: ServerFrame[] = [];
  private readonly violations: string[] = [];
  private cursor = 0;
  private wake: (() => void) | null = null;

  private constructor(private readonly socket: WebSocket) {
    socket.on('message', (data) => this.receive(data.toString()));
  }

  static async connect(port: number): Promise<WsTestClient> {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${BACKEND_PATH}`);
    const client = new WsTestClient(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    return client;
  }

  /** Sends raw text — for frames the typed helpers cannot express. */
  send(text: string): void {
    this.socket.send(text);
  }

  sendFrame(frame: ClientFrame): void {
    this.send(encodeClientFrame(frame));
  }

  async hello(): Promise<void> {
    this.sendFrame({ verb: 'HELLO', version: PROTOCOL_VERSION });
    await this.until((frame) => frame.verb === 'WELCOME');
  }

  run(files: VhdlFileInput[], topFile?: string): void {
    this.sendFrame({ verb: 'RUN', files, topFile });
  }

  stim(bits: string): void {
    this.sendFrame({ verb: 'STIM', bits });
  }

  stop(): void {
    this.sendFrame({ verb: 'STOP' });
  }

  reset(): void {
    this.sendFrame({ verb: 'RESET' });
  }

  async until(predicate: FramePredicate, timeoutMs: number = DEFAULT_WAIT_MS): Promise<ServerFrame> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const match = this.takeMatching(predicate);
      if (match) return match;
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(this.describeTimeout(timeoutMs));
      await this.waitForNextFrame(remaining);
    }
  }

  /** The most recent board state, normalised as the frontend reads it. */
  latestBoardState(): BoardState | undefined {
    for (let index = this.frames.length - 1; index >= 0; index -= 1) {
      const frame = this.frames[index];
      if (frame?.verb === 'STATE') return normalizeState(frame.bits);
    }
    return undefined;
  }

  /**
   * Waits until the *current* board state satisfies the predicate and returns how
   * long that took. It reads the latest state rather than waiting for a new frame,
   * because the backend only sends `STATE` when the board changes — a step that
   * expects "no change" would otherwise wait forever.
   */
  async untilState(predicate: (state: BoardState) => boolean, timeoutMs: number = DEFAULT_WAIT_MS): Promise<number> {
    const startedAt = Date.now();
    const deadline = startedAt + timeoutMs;
    for (;;) {
      const state = this.latestBoardState();
      if (state && predicate(state)) return Date.now() - startedAt;
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(this.describeStateTimeout(timeoutMs, state));
      await this.waitForNextFrame(remaining);
    }
  }

  close(): Promise<void> {
    if (this.socket.readyState === WebSocket.CLOSED) return Promise.resolve();
    return new Promise((resolve) => {
      this.socket.once('close', () => resolve());
      this.socket.close();
    });
  }

  private receive(text: string): void {
    const decoded = decodeServerFrame(text);
    if ('message' in decoded) this.violations.push(`${decoded.message} (frame: ${JSON.stringify(text)})`);
    else this.frames.push(decoded);
    this.wake?.();
  }

  private takeMatching(predicate: FramePredicate): ServerFrame | undefined {
    while (this.cursor < this.frames.length) {
      const frame = this.frames[this.cursor];
      this.cursor += 1;
      if (frame && predicate(frame)) return frame;
    }
    return undefined;
  }

  private waitForNextFrame(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      this.wake = () => {
        clearTimeout(timer);
        this.wake = null;
        resolve();
      };
    });
  }

  private describeStateTimeout(timeoutMs: number, last: BoardState | undefined): string {
    const shown = last ? `LEDR ${last.ledr}, HEX ${last.hex}` : 'no STATE received';
    return `the board did not reach the expected state within ${timeoutMs} ms; last state: ${shown}`;
  }

  private describeTimeout(timeoutMs: number): string {
    const seen = this.frames.map((frame) => frame.verb).join(', ') || '(none)';
    const undecodable = this.violations.length > 0 ? `; undecodable: ${this.violations.join(' | ')}` : '';
    return `no matching frame within ${timeoutMs} ms; frames seen: ${seen}${undecodable}`;
  }
}
