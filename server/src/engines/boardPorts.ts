// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The board's port vocabulary — one list for every engine (VHDL matches these names
 * exactly as lower-cased, Verilog ignoring case). Lives beside the engines, not in the
 * VHDL-specific `portDetect.ts`.
 */

/** The DE1-SoC board ports this backend knows how to wire up (§ 3.2). */
export const BOARD_PORTS = [
  'clock_50',
  // Simulator-only convenience, not a real board pin (§ 3.2 / § 5.5):
  // an already-divided 500 Hz clock, hardwired in the generated
  // testbench, so a design can react at a human-visible rate without
  // hand-writing (and interactively simulating) a 50 MHz divider.
  'clock_500hz',
  'sw',
  'key_n',
  'ledr',
  'hex0_n',
  'hex1_n',
  'hex2_n',
  'hex3_n',
  'hex4_n',
  'hex5_n',
  // Legacy tolerance (§ 3.2): older files may declare `rst`, wired from
  // `not key_n(0)` in the generated testbench when both are present.
  'rst',
] as const;

/** The board's inputs as a student writes them in messages; `BOARD_PORTS` holds them lower-cased. */
export const BOARD_INPUT_NAMES = ['CLOCK_50', 'CLOCK_500Hz', 'SW', 'KEY_N'] as const;

/** The board's outputs as a student writes them in messages. */
export const BOARD_OUTPUT_NAMES = ['LEDR', 'HEX0_N', 'HEX1_N', 'HEX2_N', 'HEX3_N', 'HEX4_N', 'HEX5_N'] as const;
