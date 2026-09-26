// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The vocabulary the simulator engines share (docs/Verilog_implementation_plan.md
 * § 5.7). Only what a board run needs is here so far; the engine interface itself
 * arrives with step E1.
 */

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
}

/**
 * How often the testbench looks at its input, and how long an applied change is held,
 * both in *simulated* nanoseconds. The right values depend on whether a fast clock
 * dominates the simulation (`session.ts`, § 5.12), which is the engine's business.
 */
export interface BoardTiming {
  readonly pollIntervalNs: number;
  readonly minDwellNs: number;
}
