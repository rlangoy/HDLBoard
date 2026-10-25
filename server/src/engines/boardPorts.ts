// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The board's ports and shape — one value for every engine (docs/board_io_v2_spec.md
 * § 4, § 7.1). The client sends it in a `BOARD` frame; `boardFrame.ts` checks every
 * field. Everything here takes the board as a parameter: there is no "current board"
 * anywhere in the backend.
 *
 * VHDL matches the names as lower-cased, Verilog ignoring case (`verilog/ports.ts`).
 */

/** A vector port, or scalar ports read as one vector (index 0 = first scalar = bit 0). */
export type PortGroup =
  | { readonly kind: 'vector'; readonly port: string; readonly count: number }
  | { readonly kind: 'scalars'; readonly ports: readonly string[] };

export interface VectorPort {
  readonly port: string;
  readonly count: number;
}

export interface ButtonGroup {
  /** A cross arrives as scalars in the order centre, up, left, right, down. */
  readonly group: PortGroup;
  readonly activeLow: boolean;
}

export interface ResetButton {
  readonly port: string;
  readonly activeLow: boolean;
}

export interface IndependentDisplays {
  readonly kind: 'independent';
  /** Display 0 (rightmost) first. */
  readonly ports: readonly string[];
  readonly width: number;
  readonly activeLow: boolean;
}

export interface MultiplexedDisplays {
  readonly kind: 'multiplexed';
  /** 7 bits, a … g. */
  readonly segments: PortGroup;
  readonly decimalPoint?: string;
  /** A vector of `digits` bits, bit 0 = display 0. */
  readonly digitEnables: string;
  readonly digits: number;
  readonly activeLow: boolean;
  readonly digitEnablesActiveLow: boolean;
}

export type SevenSegment = IndependentDisplays | MultiplexedDisplays;

export interface BoardIo {
  readonly clock: { readonly port: string; readonly mhz: number };
  /**
   * Simulator-only convenience, not a real board pin: an already-divided 500 Hz clock,
   * hardwired in the generated testbench, so a design can react at a human-visible rate
   * without hand-writing a divider.
   */
  readonly clock500Hz: string;
  readonly switches: VectorPort;
  readonly pushbuttons: ButtonGroup;
  readonly resetButton?: ResetButton;
  readonly leds: VectorPort;
  readonly sevenSegment: SevenSegment;
}

/**
 * HDLBoard's original board, used by a session that has received no `BOARD` frame —
 * the compatibility promise to older clients. The one deliberate copy of the frontend's
 * Default board (src/boards/builtinBoards.json); both packages test the same literal
 * `BOARD` frame texts (tests/fixtures/boards/board-frames.json), so the two cannot drift
 * apart unnoticed.
 */
export const DEFAULT_BOARD_IO: BoardIo = {
  clock: { port: 'CLOCK_50', mhz: 50 },
  clock500Hz: 'CLOCK_500Hz',
  switches: { port: 'SW', count: 10 },
  pushbuttons: { group: { kind: 'vector', port: 'KEY_N', count: 4 }, activeLow: true },
  leds: { port: 'LEDR', count: 10 },
  sevenSegment: { kind: 'independent', ports: ['HEX0_N', 'HEX1_N', 'HEX2_N', 'HEX3_N', 'HEX4_N', 'HEX5_N'], width: 7, activeLow: true },
};

/**
 * Legacy VHDL tolerance (§ 3.2 of the GHDL plan): older files may declare `rst`, wired
 * in the generated testbench from the reset button, or else button 0. Not a board role,
 * never a board name.
 */
export const LEGACY_RESET_PORT = 'rst';

export type BoardDirection = 'in' | 'out';

/** One board port, as the testbenches connect it. */
export interface BoardBinding {
  /** `switches`, `pushbutton0`, `sevenSegment0`, `segments`, … */
  readonly role: string;
  /** As the board spells it: `btnC`. */
  readonly name: string;
  /** Lower case, for matching. */
  readonly key: string;
  /** The testbench signal it connects to: `key_sig`. */
  readonly signal: string;
  /** A scalar port connects to one bit of its vector signal: `key_sig(0)`. */
  readonly index?: number;
  readonly direction: BoardDirection;
  /** How many bits the port has on the board: 1 for a scalar (§ 8). */
  readonly width: number;
}

/** A row of the table before its matching key is added. */
type BindingRow = Omit<BoardBinding, 'key'>;

const withKey = (row: BindingRow): BoardBinding => ({ ...row, key: row.name.toLowerCase() });

/** How a group connects: its role as a vector, the role of each scalar (`pushbutton0`, …), its signal. */
interface GroupBinding {
  readonly role: string;
  readonly scalarRole: string;
  readonly signal: string;
  readonly direction: BoardDirection;
}

/** A group's rows: the vector under `role`, or each scalar under `scalarRole0`, `scalarRole1`, … with its index. */
function groupRows(group: PortGroup, { role, scalarRole, signal, direction }: GroupBinding): BindingRow[] {
  if (group.kind === 'vector') return [{ role, name: group.port, signal, direction, width: group.count }];
  return group.ports.map((name, index) => ({ role: `${scalarRole}${index}`, name, signal, index, direction, width: 1 }));
}

function sevenSegmentRows(displays: SevenSegment): BindingRow[] {
  if (displays.kind === 'independent') {
    return displays.ports.map((name, index) => ({ role: `sevenSegment${index}`, name, signal: `hex${index}_sig`, direction: 'out', width: displays.width }));
  }
  const point: BindingRow[] =
    displays.decimalPoint === undefined ? [] : [{ role: 'decimalPoint', name: displays.decimalPoint, signal: 'dp_sig', direction: 'out', width: 1 }];
  return [
    ...groupRows(displays.segments, { role: 'segments', scalarRole: 'segment', signal: 'seg_sig', direction: 'out' }),
    ...point,
    { role: 'digitEnables', name: displays.digitEnables, signal: 'an_sig', direction: 'out', width: displays.digits },
  ];
}

/**
 * THE table, in port-map order: the order both testbench generators connect the ports
 * in (§ 7.1).
 */
export function boardBindings(board: BoardIo): readonly BoardBinding[] {
  const reset: BindingRow[] =
    board.resetButton === undefined ? [] : [{ role: 'resetButton', name: board.resetButton.port, signal: 'rstbtn_sig', direction: 'in', width: 1 }];
  const rows: BindingRow[] = [
    { role: 'clock', name: board.clock.port, signal: 'clk_sig', direction: 'in', width: 1 },
    { role: 'clock500Hz', name: board.clock500Hz, signal: 'clk500_sig', direction: 'in', width: 1 },
    { role: 'switches', name: board.switches.port, signal: 'sw_sig', direction: 'in', width: board.switches.count },
    ...groupRows(board.pushbuttons.group, { role: 'pushbuttons', scalarRole: 'pushbutton', signal: 'key_sig', direction: 'in' }),
    ...reset,
    { role: 'leds', name: board.leds.port, signal: 'ledr_sig', direction: 'out', width: board.leds.count },
    ...sevenSegmentRows(board.sevenSegment),
  ];
  return rows.map(withKey);
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

/** Whether a design's ports include any port of `group`: the vector, or one of its scalars. */
export function declaresGroup(ports: ReadonlySet<string>, group: PortGroup): boolean {
  return group.kind === 'vector' ? declaresPort(ports, group.port) : group.ports.some((name) => declaresPort(ports, name));
}

/** `HEX0…HEX5`: a run of names as its first and last. */
const nameRange = (names: readonly string[]): string => `${names[0]}…${names[names.length - 1]}`;

function displayNames(displays: SevenSegment): string[] {
  if (displays.kind === 'independent') return [nameRange(displays.ports)];
  const segments = displays.segments.kind === 'vector' ? displays.segments.port : nameRange(displays.segments.ports);
  return [segments, ...(displays.decimalPoint === undefined ? [] : [displays.decimalPoint]), displays.digitEnables];
}

/** `CLOCK_50, CLOCK_500Hz, SW, KEY, LEDR, HEX0…HEX5`: every port, runs of displays as a range. */
export function describeBoardPorts(board: BoardIo): string {
  const buttons = board.pushbuttons.group.kind === 'vector' ? [board.pushbuttons.group.port] : board.pushbuttons.group.ports;
  const reset = board.resetButton === undefined ? [] : [board.resetButton.port];
  return [board.clock.port, board.clock500Hz, board.switches.port, ...buttons, ...reset, board.leds.port, ...displayNames(board.sevenSegment)].join(', ');
}
