// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The board state a testbench publishes, made fit for the wire. `STATE` carries only
 * `0`, `1` and `X` (`protocol.ts`); a Verilog design's undefined and high-impedance
 * bits arrive as `x` and `z`, which are the same thing to a student looking at an LED
 * that is not being driven. Pure.
 */

const UNDEFINED_LEVEL = /[xXzZ]/g;

export function normaliseBoardBits(bits: string): string {
  return bits.replace(UNDEFINED_LEVEL, 'X');
}
