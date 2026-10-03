// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The DE1-SoC board's port names, lower-cased. A unit that declares one is a board
 * design, never a testbench (docs/impl_split_screen.md § 5.3, rule *-board-ports).
 *
 * Keep in step with server/src/engines/boardPorts.ts (`BOARD_PORTS`), which wires
 * these ports up on the backend; the two packages share no code.
 */
const BOARD_PORTS: ReadonlySet<string> = new Set([
  'clock_50', 'clock_500hz', 'sw', 'key_n', 'ledr',
  'hex0_n', 'hex1_n', 'hex2_n', 'hex3_n', 'hex4_n', 'hex5_n', 'rst',
]);

/** Whether `name` is a board port, in any case (VHDL and Verilog alike). */
export const isBoardPort = (name: string): boolean => BOARD_PORTS.has(name.toLowerCase());
