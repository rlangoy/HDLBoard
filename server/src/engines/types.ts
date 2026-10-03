// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The vocabulary the simulator engines share (docs/Verilog_implementation_plan.md
 * § 5.7). `Session` orchestrates a run — the stimulus queue, output polling, pacing,
 * teardown — and is engine-independent; everything specific to one simulator sits
 * behind `SimEngine`.
 */

import type { ErrorStage, VhdlFileInput } from '../protocol.js';
import type { BatchHandle, RunHandle } from '../runtime.js';

export type Language = 'vhdl' | 'verilog';

/**
 * Where a board run exchanges data with the session, as file names relative to the
 * session directory (never absolute: M11).
 */
export interface BoardFiles {
  /** The queue of pending switch and key changes, one `<seq> <SW10><KEY4>` line each. */
  readonly input: string;
  /** The board state the testbench publishes: `<52 bits> <last applied seq>`. */
  readonly output: string;
  /** How far the simulation has got, in milliseconds of simulated time — read to pace it. */
  readonly heartbeat: string;
  /** A FIFO the testbench blocks on for pacing grants; absent when pacing comes through stdin. */
  readonly pacing?: string;
}

/**
 * How often the testbench looks at its input, and how long an applied change is held,
 * both in *simulated* nanoseconds (see `boardTiming`).
 */
export interface BoardTiming {
  readonly pollIntervalNs: number;
  readonly minDwellNs: number;
}

/** What the session needs to know to run a prepared design. */
export interface RunPlan {
  /** `board`: the persistent, polled simulation. `batch`: a standalone testbench that ends by itself. */
  readonly mode: 'board' | 'batch';
  /** The session directory the run happens in. */
  readonly dir: string;
  /** What the simulator is told to run: the generated testbench, or the student's own top. */
  readonly runTarget: string;
  /** The engine's own policy for polling this design; meaningful for `board` runs. */
  readonly timing: BoardTiming;
  /** Where the testbench gets its real-time pacing grants from on this platform. */
  readonly pacing: 'fifo' | 'stdin';
  /** Simulator messages to show before the run starts: a version banner, compile warnings. */
  readonly messages: readonly string[];
}

export interface PrepareRequest {
  /** The session's temp directory, which the engine writes into and compiles in. */
  readonly dir: string;
  readonly files: readonly VhdlFileInput[];
  readonly topFile?: string;
  /** The unit of the top file to elaborate (`RUN <file> @<unit>`); omitted, the engine chooses. */
  readonly runTarget?: string;
}

/** A failure is a value: a design that does not compile is an expected outcome, not a bug. */
export type PrepareResult =
  | { readonly ok: true; readonly plan: RunPlan }
  | { readonly ok: false; readonly stage: ErrorStage; readonly text: string };

export interface SimEngine {
  readonly language: Language;
  /** Writes the files, compiles, and decides how the design will run. */
  prepare(request: PrepareRequest): Promise<PrepareResult>;
  startBoardRun(plan: RunPlan, files: BoardFiles): RunHandle;
  startBatchRun(plan: RunPlan, onOutput: (line: string) => void, timeoutMs: number): BatchHandle;
}
