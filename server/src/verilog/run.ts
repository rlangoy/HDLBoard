// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The run side of the Verilog engine: starting `vvp` on a compiled simulation
 * (docs/Verilog_implementation_plan.md § 5.4 step 3, § 5.6). A thin process layer —
 * it builds the command line and hands the child to the shared handle wrappers in
 * `runtime.ts`. `spawn` with an argument array only, never a shell string.
 */

import { spawn } from 'node:child_process';
import type { BoardFiles, BoardTiming } from '../engines/types.js';
import { createBatchHandle, createRunHandle, type BatchHandle, type RunHandle } from '../runtime.js';
import { SIMULATION_FILE_NAME } from './fileNames.js';
import { runtimeFlags, type ToolPaths } from './toolPaths.js';

/**
 * `-n`: `$stop` ends the simulation like `$finish` instead of opening an interactive
 * prompt nobody can answer. `-i`: unbuffered output — through a pipe `vvp` otherwise
 * holds a design's `$display` text back until it exits, so nothing appears while it
 * runs (M4).
 */
const NON_INTERACTIVE_UNBUFFERED = ['-n', '-i'];

export interface BoardRunRequest {
  /** The session directory, where `sim.vvp` and the exchange files live. */
  readonly dir: string;
  readonly files: BoardFiles;
  readonly timing: BoardTiming;
}

export interface BatchRunRequest {
  readonly dir: string;
  /** A batch run is expected to reach its own end; this stops one that does not. */
  readonly timeoutMs: number;
}

/**
 * Settings reach the generated testbench as `+name=value` plusargs — no recompile per
 * run, and every file name relative to `cwd` (M11).
 */
export function boardRunArguments(tools: ToolPaths, files: BoardFiles, timing: BoardTiming): string[] {
  return [
    ...runtimeFlags(tools),
    ...NON_INTERACTIVE_UNBUFFERED,
    SIMULATION_FILE_NAME,
    `+input_file=${files.input}`,
    `+output_file=${files.output}`,
    `+heartbeat_file=${files.heartbeat}`,
    `+poll_interval_ns=${timing.pollIntervalNs}`,
    `+min_dwell_ns=${timing.minDwellNs}`,
  ];
}

export function batchRunArguments(tools: ToolPaths): string[] {
  return [...runtimeFlags(tools), ...NON_INTERACTIVE_UNBUFFERED, SIMULATION_FILE_NAME];
}

/**
 * Starts the persistent, free-running board simulation. Not awaited to completion: it
 * runs until `kill()` (Stop, Reset, teardown) — or until the design ends it itself with
 * `$finish`, which the handle reports through `onExit`.
 */
export function startVerilogBoardRun(tools: ToolPaths, request: BoardRunRequest): RunHandle {
  const args = boardRunArguments(tools, request.files, request.timing);
  return createRunHandle(spawn(tools.vvp, args, { cwd: request.dir }));
}

/** Starts a standalone testbench, forwarding each line it prints to `onOutput`. */
export function startVerilogBatchRun(tools: ToolPaths, request: BatchRunRequest, onOutput: (line: string) => void): BatchHandle {
  const child = spawn(tools.vvp, batchRunArguments(tools), { cwd: request.dir });
  return createBatchHandle(child, onOutput, request.timeoutMs);
}
