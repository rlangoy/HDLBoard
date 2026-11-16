// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * What every simulator engine needs to run a child process, shared so the GHDL and
 * Verilog engines do not each carry a copy (docs/Verilog_implementation_plan.md
 * § 5.7, step D1). Moved out of `ghdl.ts` without changing behaviour.
 *
 * `spawn(cmd, argsArray, { cwd })` only, everywhere — never a shell string. No
 * source content, filename, or generic value is ever concatenated into a command
 * line. Do not "simplify" this to `exec`.
 */

import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { childEnv } from './childEnv.js';

export interface CmdResult {
  code: number;
  out: string;
  err: string;
  timedOut: boolean;
}

export interface CommandOptions {
  readonly cmd: string;
  readonly args: readonly string[];
  readonly cwd: string;
  /** Defaults to `DEFAULT_COMMAND_TIMEOUT_MS`. */
  readonly timeoutMs?: number;
  /** Aborted, the command is killed with every process it started, or never started. */
  readonly signal?: AbortSignal;
}

const ABORTED: CmdResult = { code: -1, out: '', err: 'Stopped: the session ended.', timedOut: false };

/** A bounded command is expected to finish in seconds: a compile, not a simulation. */
export const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;

/**
 * Runs a command to completion and returns what it printed. Never rejects: a program
 * that cannot be started comes back as `code: -1` with the reason in `err`, and one
 * that outlives its timeout is killed and comes back with `timedOut: true`.
 */
/**
 * Ends a compile step and every process it started: `iverilog` runs `ivlpp` and `ivl`
 * itself, and killing the driver alone leaves `ivl` spinning after a timeout. Windows:
 * `taskkill /T`; POSIX: the process group `runCommand` gave the child.
 */
function killTree(child: ChildProcess): void {
  const pid = child.pid;
  if (pid === undefined) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' }).on('error', () => child.kill('SIGKILL'));
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
}

/**
 * The most a compile step keeps of its stdout, and of its stderr: hundreds of messages,
 * of which a student reads the first. A generate loop can make Icarus print warnings by
 * the megabyte, and the page gets them all at once, past its connection's outgoing limit
 * (HDL_WS_OUTGOING_BYTES), which would cut the socket instead of showing any.
 */
export const MAX_COMMAND_OUTPUT_CHARS = 65_536;

/** The line that ends a cut output: how much more there was. */
export function outputCutNote(droppedChars: number): string {
  return `[HDLBoard: ${droppedChars} more characters of output not shown]`;
}

/**
 * Of a cut output, the share kept from its start; the rest is kept from its end. A compile
 * that fails after a flood of warnings prints its errors last, so the end holds what
 * the student has to fix (and what classifyCompileFailure reads).
 */
const HEAD_CHARS = (MAX_COMMAND_OUTPUT_CHARS * 3) / 4;
const TAIL_CHARS = MAX_COMMAND_OUTPUT_CHARS - HEAD_CHARS;

/**
 * A stream's text, up to MAX_COMMAND_OUTPUT_CHARS: whole, or its start and its end with
 * outputCutNote between. The start ends at its last whole line and the end begins at its
 * first, since a line cut in half could read as another message; a part with no line
 * break in it (one very long line) is kept as it is, so the message is not lost.
 */
export class BoundedOutput {
  private head = '';
  private tail = '';
  private total = 0;

  add(more: string): void {
    this.total += more.length;
    const room = Math.max(HEAD_CHARS - this.head.length, 0);
    this.head += more.slice(0, room);
    const rest = more.slice(room);
    if (rest !== '') this.tail = (this.tail + rest).slice(-TAIL_CHARS);
  }

  toString(): string {
    if (this.head.length + this.tail.length === this.total) return this.head + this.tail;
    const head = upToLastLineBreak(this.head);
    const tail = fromFirstLineBreak(this.tail);
    const note = outputCutNote(this.total - head.length - tail.length);
    return `${head}${head.endsWith('\n') ? '' : '\n'}${note}\n${tail}`;
  }
}

function upToLastLineBreak(text: string): string {
  const end = text.lastIndexOf('\n');
  return end === -1 ? text : text.slice(0, end + 1);
}

function fromFirstLineBreak(text: string): string {
  const start = text.indexOf('\n');
  return start === -1 ? text : text.slice(start + 1);
}

export function runCommand({ cmd, args, cwd, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS, signal }: CommandOptions): Promise<CmdResult> {
  if (signal?.aborted) return Promise.resolve(ABORTED);
  return new Promise((resolve) => {
    // Its own process group on POSIX, so a timeout reaches the tools it starts too (killTree).
    const child = spawn(cmd, args, { cwd, env: childEnv(), detached: process.platform !== 'win32' });
    const out = new BoundedOutput();
    const err = new BoundedOutput();
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutMs);
    const abort = () => killTree(child);
    signal?.addEventListener('abort', abort, { once: true });
    child.on('close', () => signal?.removeEventListener('abort', abort));

    child.stdout.on('data', (d) => out.add(String(d)));
    child.stderr.on('data', (d) => err.add(String(d)));
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, out: String(out), err: String(err) + String(e), timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, out: String(out), err: String(err), timedOut });
    });
  });
}

export interface RunHandle {
  kill(): void;
  /** `signal`: the signal that ended the process, when one did (a crash, or `kill()`). */
  onExit(cb: (code: number | null, stderr: string, signal: NodeJS.Signals | null) => void): void;
  /**
   * One call per complete line of the simulation's own stdout — the design's
   * `report`/`assert` (VHDL) or `$display` (Verilog) output. A generated testbench
   * never writes to stdout (its result goes to a real file, specifically so it can
   * never be confused with this), so every line here is the student's own design.
   */
  onOutput(cb: (line: string) => void): void;
  /**
   * Writes `lines` newline-terminated lines into the process's stdin — the pacing
   * grants when the testbench reads them from stdin. A no-op once the process has
   * gone.
   */
  grantPacing(lines: number): void;
}

export interface BatchResult {
  /** `null` only if the process was killed (Stop, or the timeout). */
  code: number | null;
  timedOut: boolean;
  stderr: string;
  /** The signal that ended the process, when one did: a crash, the timeout or `kill()`. */
  signal?: NodeJS.Signals | null;
}

export interface BatchHandle {
  kill(): void;
  /** Resolves once, when the process exits — on its own, or via `kill()`. */
  done: Promise<BatchResult>;
}

/**
 * Buffers arbitrary chunks and emits one callback per complete line. A Windows line
 * ending (`\r\n`) is one line ending: `vvp` writes it there, and a line that ends in a
 * stray carriage return would reach the console and any exact comparison. A `\r` at
 * the end of a chunk simply waits for the `\n` that follows.
 */
export function lineSplitter(cb: (line: string) => void): (chunk: Buffer | string) => void {
  let buf = '';
  return (chunk) => {
    buf += chunk;
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) cb(line.endsWith('\r') ? line.slice(0, -1) : line);
  };
}

/**
 * The most of a process's stderr kept: enough for any compiler or crash message, never
 * a board run's warnings piling up for hours. The end is kept, where a crash says why.
 */
const MAX_STDERR_CHARS = 65_536;

/** `text` and then `more`, cut to its last MAX_STDERR_CHARS. */
function appendTail(text: string, more: string): string {
  const joined = text + more;
  return joined.length <= MAX_STDERR_CHARS ? joined : joined.slice(-MAX_STDERR_CHARS);
}

/**
 * Stops a killed child's output reaching anyone. Only the `data` listeners go: removing
 * *every* listener also strips the stream's own, and the child's `close` event — which
 * waits for its streams to end — would then never fire.
 */
function stopDelivering(child: ChildProcessWithoutNullStreams): void {
  child.stdout.removeAllListeners('data');
  child.stderr.removeAllListeners('data');
}

/** How long a stopped simulation gets to end by itself before it is killed outright. */
export const KILL_GRACE_MS = 2_000;

/**
 * Stops a simulation for good. SIGTERM alone is not enough on POSIX: `vvp` catches it
 * and only finishes once its scheduler next runs (Icarus `vvp/schedule.cc`), which
 * never happens while a paced board run sits blocked reading its next grant from
 * stdin, so it would outlive its session. Closing stdin ends that read; a process
 * still alive after KILL_GRACE_MS (a design looping without delay) gets SIGKILL. On
 * Windows `kill()` already ends the process outright.
 */
function terminate(child: ChildProcessWithoutNullStreams): void {
  stopDelivering(child);
  child.stdin.destroy();
  child.kill('SIGTERM');
  if (child.exitCode !== null || child.signalCode !== null) return;
  const backstop = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS);
  // Never what keeps the backend (or a test) running.
  backstop.unref();
  child.once('exit', () => clearTimeout(backstop));
}

/**
 * Wraps a running child as a `RunHandle` — the persistent, free-running simulation
 * that lives until `kill()` (Stop, Reset, session teardown).
 */
export function createRunHandle(child: ChildProcessWithoutNullStreams): RunHandle {
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr = appendTail(stderr, String(chunk))));
  // stdin is only ever written for pacing, but the stream exists either way, and a
  // write to a process that has just exited (Stop/Reset racing a pacing tick)
  // surfaces as an `error` event — EPIPE on POSIX, EOF/EPERM on Windows. Unhandled,
  // that is an uncaught exception in the backend, so it is swallowed: the exit
  // itself is reported through `close`.
  child.stdin.on('error', () => {});
  // A program that cannot be started (a missing `vvp`) reports through `error`, which unhandled
  // would take the whole backend down; its reason becomes the run's stderr instead.
  child.on('error', (error) => (stderr = appendTail(stderr, error.message)));

  const outputCallbacks: Array<(line: string) => void> = [];
  child.stdout.on('data', lineSplitter((line) => {
    for (const callback of outputCallbacks) callback(line);
  }));

  const exitCallbacks: Array<(code: number | null, stderr: string, signal: NodeJS.Signals | null) => void> = [];
  child.on('close', (code, signal) => exitCallbacks.forEach((callback) => callback(code, stderr, signal)));

  return {
    kill: () => terminate(child),
    onExit: (callback) => exitCallbacks.push(callback),
    onOutput: (callback) => outputCallbacks.push(callback),
    grantPacing: (lines) => {
      if (lines > 0 && child.stdin.writable) child.stdin.write('\n'.repeat(lines));
    },
  };
}

/**
 * Wraps a child expected to reach the end of its own accord as a `BatchHandle`. It is
 * bounded by `timeoutMs`: with no polling loop of ours keeping a runaway design alive
 * on purpose, this is what stops a design bug (a loop with no delay) from hanging the
 * server. Standard input is closed at once, so a design that reads it sees end-of-file
 * instead of waiting for a grant that a batch run never sends.
 */
export function createBatchHandle(
  child: ChildProcessWithoutNullStreams,
  onOutput: (line: string) => void,
  timeoutMs: number,
): BatchHandle {
  let stderr = '';
  let timedOut = false;
  child.stdin.on('error', () => {});
  child.on('error', (error) => (stderr = appendTail(stderr, error.message)));
  child.stdin.end();
  child.stderr.on('data', (chunk) => (stderr = appendTail(stderr, String(chunk))));
  child.stdout.on('data', lineSplitter(onOutput));

  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, timeoutMs);

  const done = new Promise<BatchResult>((resolve) => {
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, timedOut, stderr, signal });
    });
  });

  return {
    kill: () => {
      clearTimeout(timer);
      terminate(child);
    },
    done,
  };
}
