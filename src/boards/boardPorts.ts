// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * What can be read off a board's port names (docs/board_io_v2_spec.md § 5.6, § 9):
 * which names make a unit a board design, and which names a board change renames.
 */

import { builtInBoard, DEFAULT_BOARD } from './boardCatalog';
import { LEGACY_RESET_PORT } from './boardNames';
import { groupNames, portList } from './boardShape';
import { sameButtonShape, sameMultiplexing, sameResetShape, sameSevenSegmentShape } from './shapeChange';
import type { BoardDefinition, BoardPorts, MultiplexedDisplays, SevenSegment } from './types';

/** The board's port names, lower case: how both languages match them. */
export function portKeysOf(board: BoardDefinition): Set<string> {
  return new Set(portList(board.ports).map((name) => name.toLowerCase()));
}

/**
 * The boards whose names always mark a board design (F8). Not every built-in: Digilent's
 * `clk`, `led`, `seg` and `an` are common sub-module port names.
 */
export const LEGACY_DETECTION_BOARDS: readonly BoardDefinition[] = [DEFAULT_BOARD, builtInBoard('de1-soc')];

/** The port names of the legacy detection boards, lower case. */
export const BUILT_IN_PORT_NAMES: ReadonlySet<string> = new Set(LEGACY_DETECTION_BOARDS.flatMap((board) => [...portKeysOf(board)]));

/**
 * The names that make a unit a board design rather than a testbench: Default's and
 * DE1-SoC's, the active board's, and the legacy `rst`.
 */
export function boardDesignPortNames(active: BoardDefinition): ReadonlySet<string> {
  return new Set([...BUILT_IN_PORT_NAMES, ...portKeysOf(active), LEGACY_RESET_PORT]);
}

// --- Renames between boards (§ 9) -----------------------------------------------------

/** One port renamed: `KEY_N` → `KEY`. */
export interface PortRename {
  readonly from: string;
  readonly to: string;
}

/** The renames name by name, leaving out names that stay the same. */
function pairNames(from: readonly string[], to: readonly string[]): PortRename[] {
  return from.flatMap((name, index) => (name === to[index] ? [] : [{ from: name, to: to[index] }]));
}

/** Both names, or neither: an optional port is renamed only when both boards have it. */
function pairOptional(from: string | undefined, to: string | undefined): PortRename[] {
  return from !== undefined && to !== undefined ? pairNames([from], [to]) : [];
}

function multiplexedRenames(from: MultiplexedDisplays, to: MultiplexedDisplays): PortRename[] {
  if (!sameMultiplexing(from, to)) return [];
  const segments = from.segments.kind === to.segments.kind ? pairNames(groupNames(from.segments), groupNames(to.segments)) : [];
  return [...segments, ...pairOptional(from.decimalPoint, to.decimalPoint), ...pairNames([from.digitEnables], [to.digitEnables])];
}

function sevenSegmentRenames(from: SevenSegment, to: SevenSegment): PortRename[] {
  if (from.kind === 'multiplexed' && to.kind === 'multiplexed') return multiplexedRenames(from, to);
  if (from.kind === 'independent' && to.kind === 'independent' && sameSevenSegmentShape(from, to)) return pairNames(from.ports, to.ports);
  return [];
}

type RoleRename = (from: BoardPorts, to: BoardPorts) => PortRename[];

/**
 * The one rename rule, role by role (§ 9): a role's ports are renamed only when, after
 * the rename, they need no further edit — the same structure, width and polarity.
 * Everything else is a `ShapeDifference`, changed by hand.
 */
const ROLE_RENAMES = {
  clock: (from, to) => pairNames([from.clock.port], [to.clock.port]),
  clock500Hz: (from, to) => pairNames([from.clock500Hz], [to.clock500Hz]),
  switches: (from, to) => (from.switches.count === to.switches.count ? pairNames([from.switches.port], [to.switches.port]) : []),
  pushbuttons: ({ pushbuttons: from }, { pushbuttons: to }) =>
    sameButtonShape(from, to) ? pairNames(groupNames(from.group), groupNames(to.group)) : [],
  resetButton: ({ resetButton: from }, { resetButton: to }) => (sameResetShape(from, to) ? pairOptional(from?.port, to?.port) : []),
  leds: (from, to) => (from.leds.count === to.leds.count ? pairNames([from.leds.port], [to.leds.port]) : []),
  sevenSegment: (from, to) => sevenSegmentRenames(from.sevenSegment, to.sevenSegment),
} satisfies Record<string, RoleRename>;

export type RenamedRole = keyof typeof ROLE_RENAMES;

export function roleRenames(role: RenamedRole, from: BoardPorts, to: BoardPorts): PortRename[] {
  return ROLE_RENAMES[role](from, to);
}

/** Every rename from one board to another, in role order. */
export function renamesBetween(from: BoardDefinition, to: BoardDefinition): PortRename[] {
  return Object.values(ROLE_RENAMES).flatMap((rename) => rename(from.ports, to.ports));
}
