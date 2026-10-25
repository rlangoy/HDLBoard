// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The `BOARD` frame's body (docs/board_io_v2_spec.md § 6.1): one line of versioned JSON
 * with the board's normalized ports,
 *
 *   {"version":2,"clock":{"port":"clk","mhz":100},"clock500Hz":"CLOCK_500Hz",…}
 *
 * or, from a 1.6 client, the version-1 body of one line per role, upgraded here to the
 * Default shape (`clock50 CLOCK_50`, `switches SW`, …).
 *
 * The names are pasted into generated VHDL and Verilog, so the checks here are the
 * security boundary: every field is checked for its type and range, nothing unknown is
 * accepted, and nothing but a plain identifier gets through as a name — no quote,
 * parenthesis, semicolon, newline or comment marker ever reaches a testbench. The
 * server never relies on the client having checked anything.
 *
 * Reserved words are deliberately not checked (v1 § 9.2): `signal` passes, and the
 * generated testbench then fails to compile with the simulator's own error. That is
 * safe and visible, and HDLBoard's own frontend never sends one.
 *
 * Keep in step with src/boards/boardFrame.ts; both test the texts in
 * tests/fixtures/boards/board-frames.json.
 */

import { readBoardIo, checkNamesUnique, BoardRejection } from './boardFrameFields.js';
import { DEFAULT_BOARD_IO, type BoardIo } from './engines/boardPorts.js';
import { nameProblem } from './boardNames.js';

export const BOARD_FRAME_VERSION = 2;

export type DecodedBoard = { readonly ok: true; readonly board: BoardIo } | { readonly ok: false; readonly reason: string };

const rejected = (reason: string): DecodedBoard => ({ ok: false, reason: `BOARD: ${reason}` });

/** The board a `BOARD` body names: a JSON body, or a 1.6 client's line body. */
export function decodeBoardBody(body: string): DecodedBoard {
  try {
    const board = body.startsWith('{') ? decodeJsonBody(body) : decodeV1Body(body);
    checkNamesUnique(board);
    return { ok: true, board };
  } catch (error) {
    if (error instanceof BoardRejection) return rejected(error.message);
    throw error;
  }
}

function decodeJsonBody(body: string): BoardIo {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new BoardRejection('the body is not valid JSON');
  }
  return readBoardIo(value, BOARD_FRAME_VERSION);
}

export function encodeBoardBody(board: BoardIo): string {
  const { clock, switches, pushbuttons, resetButton, leds, sevenSegment } = board;
  const group = pushbuttons.group;
  return JSON.stringify({
    version: BOARD_FRAME_VERSION,
    clock: { port: clock.port, mhz: clock.mhz },
    clock500Hz: board.clock500Hz,
    switches: { port: switches.port, count: switches.count },
    pushbuttons: { group: group.kind === 'vector' ? { kind: 'vector', port: group.port, count: group.count } : { kind: 'scalars', ports: group.ports }, activeLow: pushbuttons.activeLow },
    ...(resetButton === undefined ? {} : { resetButton: { port: resetButton.port, activeLow: resetButton.activeLow } }),
    leds: { port: leds.port, count: leds.count },
    sevenSegment: sevenSegmentJson(sevenSegment),
  });
}

function sevenSegmentJson(displays: BoardIo['sevenSegment']): object {
  if (displays.kind === 'independent') return { kind: 'independent', ports: displays.ports, width: displays.width, activeLow: displays.activeLow };
  const segments = displays.segments.kind === 'vector' ? { kind: 'vector', port: displays.segments.port, count: displays.segments.count } : { kind: 'scalars', ports: displays.segments.ports };
  return {
    kind: 'multiplexed',
    segments,
    ...(displays.decimalPoint === undefined ? {} : { decimalPoint: displays.decimalPoint }),
    digitEnables: displays.digitEnables,
    digits: displays.digits,
    activeLow: displays.activeLow,
    digitEnablesActiveLow: displays.digitEnablesActiveLow,
  };
}

// --- The version-1 body of a 1.6 client (§ 6.3) -----------------------------------

type V1Role = 'clock50' | 'clock500Hz' | 'switches' | 'pushbuttons' | 'leds' | 'sevenSegment';
const V1_ROLES: readonly V1Role[] = ['clock50', 'clock500Hz', 'switches', 'pushbuttons', 'leds', 'sevenSegment'];
/** The shape every version-1 board had: the Default board's. */
const V1_SHAPE = { buttons: 4, displays: 6, segments: 7 } as const;

const isV1Role = (word: string): word is V1Role => (V1_ROLES as readonly string[]).includes(word);
const v1NameCount = (role: V1Role): number => (role === 'sevenSegment' ? V1_SHAPE.displays : 1);

/** One `role name…` line: the role and its names. */
function parseV1Line(line: string): { role: V1Role; names: string[] } {
  const [role = '', ...names] = line.split(' ');
  if (!isV1Role(role)) throw new BoardRejection(`unknown role ${JSON.stringify(role)}`);
  if (names.length !== v1NameCount(role)) throw new BoardRejection(`${role} needs ${v1NameCount(role)} name(s), got ${names.length}`);
  const problem = names.map(nameProblem).find((p) => p !== undefined);
  if (problem !== undefined) throw new BoardRejection(`${role}: ${problem}`);
  return { role, names };
}

/** A 1.6 client's board: its names on the Default board's shape, which is all version 1 could say. */
function decodeV1Body(body: string): BoardIo {
  const names: Partial<Record<V1Role, readonly string[]>> = {};
  for (const line of body.split('\n')) {
    const parsed = parseV1Line(line);
    if (names[parsed.role] !== undefined) throw new BoardRejection(`${parsed.role} is given twice`);
    names[parsed.role] = parsed.names;
  }
  const missing = V1_ROLES.find((role) => names[role] === undefined);
  if (missing !== undefined) throw new BoardRejection(`${missing} is missing`);
  const nameOf = (role: V1Role): string => names[role]?.[0] ?? '';
  const base = DEFAULT_BOARD_IO;
  return {
    ...base,
    clock: { port: nameOf('clock50'), mhz: base.clock.mhz },
    clock500Hz: nameOf('clock500Hz'),
    switches: { ...base.switches, port: nameOf('switches') },
    pushbuttons: { ...base.pushbuttons, group: { kind: 'vector', port: nameOf('pushbuttons'), count: V1_SHAPE.buttons } },
    leds: { ...base.leds, port: nameOf('leds') },
    sevenSegment: { kind: 'independent', ports: names.sevenSegment ?? [], width: V1_SHAPE.segments, activeLow: true },
  };
}
