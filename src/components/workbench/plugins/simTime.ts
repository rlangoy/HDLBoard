// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Simulated time as a plugin line carries it: integer nanoseconds since the start of
 * the run (docs/plugin_batch_implementation_plan.md § 3.4). Pure.
 */

const NS_PER_US = 1e3;
const NS_PER_MS = 1e6;
const NS_PER_S = 1e9;
/** Three decimals: every nanosecond of a microsecond reading is shown. */
const DECIMALS = 3;

/** Simulated time for display: "850 ns", "83.495 µs", "1.204 ms", "3.000 s". */
export function formatSimTime(ns: number): string {
  if (ns < NS_PER_US) return `${ns} ns`;
  if (ns < NS_PER_MS) return `${(ns / NS_PER_US).toFixed(DECIMALS)} µs`;
  if (ns < NS_PER_S) return `${(ns / NS_PER_MS).toFixed(DECIMALS)} ms`;
  return `${(ns / NS_PER_S).toFixed(DECIMALS)} s`;
}
