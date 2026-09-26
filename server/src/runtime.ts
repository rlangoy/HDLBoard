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

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

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
}

/** A bounded command is expected to finish in seconds: a compile, not a simulation. */
export const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;

/**
 * Runs a command to completion and returns what it printed. Never rejects: a program
 * that cannot be started comes back as `code: -1` with the reason in `err`, and one
 * that outlives its timeout is killed and comes back with `timedOut: true`.
 */
export function runCommand({ cmd, args, cwd, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS }: CommandOptions): Promise<CmdResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd });
    let out = '';
    let err = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, out, err: err + String(e), timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, out, err, timedOut });
    });
  });
}

export interface RunHandle {
  kill(): void;
  onExit(cb: (code: number | null, stderr: string) => void): void;
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
 * Stops a killed child's output reaching anyone. Only the `data` listeners go: removing
 * *every* listener also strips the stream's own, and the child's `close` event — which
 * waits for its streams to end — would then never fire.
 */
function stopDelivering(child: ChildProcessWithoutNullStreams): void {
  child.stdout.removeAllListeners('data');
  child.stderr.removeAllListeners('data');
}

/**
 * Wraps a running child as a `RunHandle` — the persistent, free-running simulation
 * that lives until `kill()` (Stop, Reset, session teardown).
 */
export function createRunHandle(child: ChildProcessWithoutNullStreams): RunHandle {
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk));
  // stdin is only ever written for pacing, but the stream exists either way, and a
  // write to a process that has just exited (Stop/Reset racing a pacing tick)
  // surfaces as an `error` event — EPIPE on POSIX, EOF/EPERM on Windows. Unhandled,
  // that is an uncaught exception in the backend, so it is swallowed: the exit
  // itself is reported through `close`.
  child.stdin.on('error', () => {});

  const outputCallbacks: Array<(line: string) => void> = [];
  child.stdout.on('data', lineSplitter((line) => {
    for (const callback of outputCallbacks) callback(line);
  }));

  const exitCallbacks: Array<(code: number | null, stderr: string) => void> = [];
  child.on('close', (code) => exitCallbacks.forEach((callback) => callback(code, stderr)));

  return {
    kill: () => {
      stopDelivering(child);
      child.kill('SIGTERM');
    },
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
  child.stdin.end();
  child.stderr.on('data', (chunk) => (stderr += chunk));
  child.stdout.on('data', lineSplitter(onOutput));

  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, timeoutMs);

  const done = new Promise<BatchResult>((resolve) => {
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, timedOut, stderr });
    });
  });

  return {
    kill: () => {
      clearTimeout(timer);
      stopDelivering(child);
      child.kill('SIGTERM');
    },
    done,
  };
}
