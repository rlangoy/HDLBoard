// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * What can be read off a board's port names (docs/board_io_config_spec.md § 6.2, § 7.1).
 * The board's shape — how many switches, keys, LEDs and displays — is fixed in
 * version 1 of the board format, and lives here, once.
 */

import { BUILT_IN_BOARDS } from './boardCatalog';
import type { BoardDefinition, BoardPorts } from './types';

export const SWITCH_COUNT = 10;
export const PUSHBUTTON_COUNT = 4;
export const LED_COUNT = 10;
export const SEVEN_SEGMENT_COUNT = 6;
export const SEGMENTS_PER_DISPLAY = 7;

/** Every port name of the board, in role order. */
export function portList(ports: BoardPorts): string[] {
  return [ports.clock50, ports.clock500Hz, ports.switches, ports.pushbuttons, ports.leds, ...ports.sevenSegment];
}

/** The board's port names, lower case: how both languages match them. */
export function portKeysOf(board: BoardDefinition): Set<string> {
  return new Set(portList(board.ports).map((name) => name.toLowerCase()));
}

/** The port names of every built-in board, lower case: a design in any of them is a board design. */
export const BUILT_IN_PORT_NAMES: ReadonlySet<string> = new Set(BUILT_IN_BOARDS.flatMap((board) => [...portKeysOf(board)]));

/** One port renamed: `KEY_N` → `KEY`. */
export interface PortRename {
  readonly from: string;
  readonly to: string;
}

/** The renames from one board to another: every role whose name differs; the displays element by element. */
export function renamesBetween(from: BoardDefinition, to: BoardDefinition): PortRename[] {
  const fromNames = portList(from.ports);
  const toNames = portList(to.ports);
  return fromNames.flatMap((name, index) => (name === toNames[index] ? [] : [{ from: name, to: toNames[index] }]));
}

const lastIndex = (count: number): number => count - 1;

/** `LEDR[9:0]`: a vector port with its range. */
export function vectorHeading(name: string, width: number): string {
  return `${name}[${lastIndex(width)}:0]`;
}

/**
 * The seven-segment ports as one heading: `HEXn_N[6:0]` when the six names are one
 * pattern with the display number in it (as on every built-in board), else the compact
 * `HEX0…HEX5[6:0]`.
 */
export function sevenSegmentHeading(names: readonly string[]): string {
  const pattern = displayPattern(names);
  const shown = pattern ?? `${names[0]}…${names[names.length - 1]}`;
  return vectorHeading(shown, SEGMENTS_PER_DISPLAY);
}

/** `HEXn_N` for `HEX0_N` … `HEX5_N`: one prefix, the index 0, 1, … in order, one suffix. */
function displayPattern(names: readonly string[]): string | undefined {
  const first = names[0];
  const digitAt = first?.indexOf('0') ?? -1;
  if (first === undefined || digitAt < 0) return undefined;
  const prefix = first.slice(0, digitAt);
  const suffix = first.slice(digitAt + 1);
  const isPattern = names.every((name, index) => name === `${prefix}${index}${suffix}`);
  return isPattern ? `${prefix}n${suffix}` : undefined;
}

/** `HEX0_N … HEX5_N → HEX0 … HEX5` style: the first and last of a run of display names. */
export function displayRange(names: readonly string[]): string {
  return `${names[0]} … ${names[names.length - 1]}`;
}
