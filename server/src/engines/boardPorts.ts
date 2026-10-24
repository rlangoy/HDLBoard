// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The board's port vocabulary — one value for every engine (docs/board_io_config_spec.md
 * § 9.1). A board maps each fixed role (the switches, the pushbuttons, …) to the name a
 * design declares for it; the client sends it in a `BOARD` frame. Everything here takes
 * the board as a parameter: there is no "current board" anywhere in the backend.
 *
 * VHDL matches the names as lower-cased, Verilog ignoring case (`verilog/ports.ts`).
 */

export interface BoardIo {
  readonly clock50: string;
  /**
   * Simulator-only convenience, not a real board pin (§ 3.2 / § 5.5 of the GHDL plan):
   * an already-divided 500 Hz clock, hardwired in the generated testbench, so a design
   * can react at a human-visible rate without hand-writing a 50 MHz divider.
   */
  readonly clock500Hz: string;
  readonly switches: string;
  readonly pushbuttons: string;
  readonly leds: string;
  /** Display 0 (rightmost) first; SEVEN_SEGMENT_COUNT names. */
  readonly sevenSegment: readonly string[];
}

export const SEVEN_SEGMENT_COUNT = 6;

/**
 * HDLBoard's original names, used by a session that has received no `BOARD` frame —
 * the compatibility promise to older clients. The one deliberate copy of the frontend's
 * Default board (src/boards/builtinBoards.json); both packages test the same literal
 * `BOARD` frame text, so the two cannot drift apart unnoticed.
 */
export const DEFAULT_BOARD_IO: BoardIo = {
  clock50: 'CLOCK_50',
  clock500Hz: 'CLOCK_500Hz',
  switches: 'SW',
  pushbuttons: 'KEY_N',
  leds: 'LEDR',
  sevenSegment: ['HEX0_N', 'HEX1_N', 'HEX2_N', 'HEX3_N', 'HEX4_N', 'HEX5_N'],
};

/**
 * Legacy VHDL tolerance (§ 3.2 of the GHDL plan): older files may declare `rst`, wired
 * from the first pushbutton in the generated testbench. Not a board role, never a board name.
 */
export const LEGACY_RESET_PORT = 'rst';

export type BoardDirection = 'in' | 'out';

/** One board port, as the testbenches connect it. */
export interface BoardBinding {
  /** `switches`, `sevenSegment0`, … */
  readonly role: string;
  /** As the board spells it: `KEY`. */
  readonly name: string;
  /** Lower case, for matching. */
  readonly key: string;
  /** The testbench signal it connects to: `key_sig`. */
  readonly signal: string;
  readonly direction: BoardDirection;
}

function binding(role: string, name: string, signal: string, direction: BoardDirection): BoardBinding {
  return { role, name, key: name.toLowerCase(), signal, direction };
}

/**
 * THE table, in port-map order: the order both testbench generators connect the ports
 * in and `STATE` is assembled in (LEDs, then display 0 … 5).
 */
export function boardBindings(board: BoardIo): readonly BoardBinding[] {
  return [
    binding('clock50', board.clock50, 'clk_sig', 'in'),
    binding('clock500Hz', board.clock500Hz, 'clk500_sig', 'in'),
    binding('switches', board.switches, 'sw_sig', 'in'),
    binding('pushbuttons', board.pushbuttons, 'key_sig', 'in'),
    binding('leds', board.leds, 'ledr_sig', 'out'),
    ...board.sevenSegment.map((name, index) => binding(`sevenSegment${index}`, name, `hex${index}_sig`, 'out')),
  ];
}

/** The board's port names, lower case, in table order; with `legacyReset`, `rst` last. */
export function boardPortKeys(board: BoardIo, options: { legacyReset?: boolean } = {}): ReadonlySet<string> {
  const keys = boardBindings(board).map((b) => b.key);
  return new Set(options.legacyReset ? [...keys, LEGACY_RESET_PORT] : keys);
}

/** The inputs as a student writes them in messages: `['CLOCK_50', 'CLOCK_500Hz', 'SW', 'KEY']`. */
export function boardInputNames(board: BoardIo): string[] {
  return boardBindings(board)
    .filter((b) => b.direction === 'in')
    .map((b) => b.name);
}

/** The outputs as a student writes them in messages: `['LEDR', 'HEX0', …]`. */
export function boardOutputNames(board: BoardIo): string[] {
  return boardBindings(board)
    .filter((b) => b.direction === 'out')
    .map((b) => b.name);
}

/** Whether a design's ports (lower case) include the board port `name`. */
export function declaresPort(ports: ReadonlySet<string>, name: string): boolean {
  return ports.has(name.toLowerCase());
}

/** `CLOCK_50, CLOCK_500Hz, SW, KEY, LEDR, HEX0…HEX5`: every port, the displays as a range. */
export function describeBoardPorts(board: BoardIo): string {
  const displays = `${board.sevenSegment[0]}…${board.sevenSegment[board.sevenSegment.length - 1]}`;
  return [board.clock50, board.clock500Hz, board.switches, board.pushbuttons, board.leds, displays].join(', ');
}
