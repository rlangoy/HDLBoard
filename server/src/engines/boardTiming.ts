// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * How often a board testbench looks at its input and how long it holds an applied
 * change — one policy for every engine, moved here from `session.ts` so the GHDL and
 * Verilog engines share it (docs/ghdl_implementation_plan.md § 5.8, § 5.12, § 5.13).
 * The reasoning below is unchanged from where it came from.
 *
 * The interval is in *simulated* time but what a student feels is *real* time, and the
 * exchange rate between the two differs by three orders of magnitude depending on one
 * thing: whether a `CLOCK_50` process exists.
 *
 * With `CLOCK_50` declared, a 20 ns-period clock dominates everything and simulated
 * time crawls — measured at ~0.0015x real (GHDL) and ~0.015x (Icarus, M6) — so a 1 ms
 * interval samples input only about every 685 ms of real time, which is both the
 * "reacts slowly" latency and, worse, slow enough to miss a button press entirely. A
 * finer interval is close to free there, because the clock, not this process, is what
 * costs: 1 ms/100 us/10 us/1 us all measured the same simulated-time throughput.
 *
 * Without `CLOCK_50` the exchange rate inverts — simulated time runs at or above real
 * time (§ 5.9 paces it back down) — and a 1 us interval measured 0.15x real time, i.e.
 * the polling process becomes the bottleneck all over again. Hence two values, chosen
 * so that *real*-time responsiveness lands in the same few-milliseconds range either way.
 */

import type { BoardTiming } from './types.js';

/**
 * Minimum simulated time each queued input transition is held before the next is
 * applied (§ 5.13). Only matters when transitions arrive faster than one per poll — a
 * press and release that reached the process together — since a real human press lasts
 * far longer than either value. With `CLOCK_50` one poll (10 us) is already 500 clock
 * edges. Without it, 4 ms spans two rising edges of `CLOCK_500Hz`, so a design that
 * samples the pushbuttons on that clock still sees every queued press.
 */
export const TIMING_WITH_CLOCK_50: BoardTiming = { pollIntervalNs: 10_000, minDwellNs: 10_000 };

export const TIMING_WITHOUT_CLOCK_50: BoardTiming = { pollIntervalNs: 1_000_000, minDwellNs: 4_000_000 };

/**
 * The one policy for every engine: what a design's clock decides is how finely to poll.
 * The board's clock, whatever its name and frequency (`CLOCK_50`, `clk` at 100 MHz),
 * is what makes simulated time crawl; a faster one only crawls more.
 */
export function boardTimingFor(hasBoardClock: boolean): BoardTiming {
  return hasBoardClock ? TIMING_WITH_CLOCK_50 : TIMING_WITHOUT_CLOCK_50;
}

/**
 * A multiplexed digit not refreshed for this long goes dark (docs/board_io_v2_spec.md
 * § 7.4). 75 ms leaves a margin over the 50 ms period of a 20 Hz refresh. Written into
 * both testbench generators; not configurable.
 */
export const DISPLAY_PERSIST_MS = 75;

const PS_PER_NS = 1000;
/** Half a period in picoseconds is 500 000 / MHz. */
const PS_PER_HALF_PERIOD_AT_1_MHZ = 500_000;

/** The board clock's half period, rounded to 1 ps: 10 000 ps at 50 MHz, 6734 ps at 74.25 MHz. */
export function clockHalfPeriodPs(mhz: number): number {
  return Math.round(PS_PER_HALF_PERIOD_AT_1_MHZ / mhz);
}

/** A VHDL time: `10 ns` when whole nanoseconds (so 50 MHz stays as it was), else `6734 ps`. */
export function vhdlTime(ps: number): string {
  return ps % PS_PER_NS === 0 ? `${ps / PS_PER_NS} ns` : `${ps} ps`;
}

/** A Verilog delay at the testbench's 1 ns timescale, at most 3 decimals: `10`, `6.734`. */
export function verilogDelay(ps: number): string {
  return String(ps / PS_PER_NS);
}
