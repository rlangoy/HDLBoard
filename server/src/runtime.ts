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

import { spawn } from 'node:child_process';

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
const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;

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

/** Buffers arbitrary chunks and emits one callback per complete line. */
export function lineSplitter(cb: (line: string) => void): (chunk: Buffer | string) => void {
  let buf = '';
  return (chunk) => {
    buf += chunk;
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) cb(line);
  };
}
