// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The `BOARD` frame's body (docs/board_io_config_spec.md § 8.1): one line per board
 * role, the role then its port name(s).
 *
 *   clock50 CLOCK_50
 *   clock500Hz CLOCK_500Hz
 *   switches SW
 *   pushbuttons KEY
 *   leds LEDR
 *   sevenSegment HEX0 HEX1 HEX2 HEX3 HEX4 HEX5
 *
 * The names are pasted into generated VHDL and Verilog, so the identifier rule here is
 * the security boundary: nothing but a plain identifier gets through — no quote,
 * parenthesis, semicolon, newline or comment marker ever reaches a testbench. The
 * server never relies on the client having checked anything.
 *
 * Reserved words are deliberately not checked (§ 9.2): `signal` passes, and the
 * generated testbench then fails to compile with the simulator's own error. That is
 * safe and visible, and HDLBoard's own frontend never sends one.
 *
 * Keep in step with src/boards/boardFrame.ts; both test the same literal Default frame.
 */

import { boardBindings, LEGACY_RESET_PORT, SEVEN_SEGMENT_COUNT, type BoardIo } from './engines/boardPorts.js';

const PLAIN_IDENTIFIER = /^[A-Za-z](?:_?[A-Za-z0-9])*$/;
const MAX_NAME_LENGTH = 32;

type Role = keyof BoardIo;
const ROLES: readonly Role[] = ['clock50', 'clock500Hz', 'switches', 'pushbuttons', 'leds', 'sevenSegment'];

/** How many names each role takes: six displays, one port for everything else. */
const nameCount = (role: Role): number => (role === 'sevenSegment' ? SEVEN_SEGMENT_COUNT : 1);

const isRole = (word: string): word is Role => (ROLES as readonly string[]).includes(word);

export type DecodedBoard = { readonly ok: true; readonly board: BoardIo } | { readonly ok: false; readonly reason: string };

const rejected = (reason: string): DecodedBoard => ({ ok: false, reason: `BOARD: ${reason}` });

/** Why `name` cannot be a board port name, or undefined when it can. */
function nameProblem(name: string): string | undefined {
  if (!PLAIN_IDENTIFIER.test(name)) return `${JSON.stringify(name)} is not a plain identifier`;
  if (name.length > MAX_NAME_LENGTH) return `${JSON.stringify(name)} is longer than ${MAX_NAME_LENGTH} characters`;
  if (name.toLowerCase() === LEGACY_RESET_PORT) return `"${LEGACY_RESET_PORT}" is reserved`;
  return undefined;
}

/** One `role name…` line: the role and its names, or why the line is not one. */
function parseLine(line: string): { role: Role; names: string[] } | string {
  const [role = '', ...names] = line.split(' ');
  if (!isRole(role)) return `unknown role ${JSON.stringify(role)}`;
  if (names.length !== nameCount(role)) return `${role} needs ${nameCount(role)} name(s), got ${names.length}`;
  const problem = names.map(nameProblem).find((p) => p !== undefined);
  return problem === undefined ? { role, names } : `${role}: ${problem}`;
}

/** One board serves both languages, and VHDL ignores case: `Key` and `KEY` would be one port. */
function duplicateName(board: BoardIo): string | undefined {
  const bindings = boardBindings(board);
  return bindings.find((binding, index) => bindings.findIndex((other) => other.key === binding.key) !== index)?.name;
}

/** A role's names as the frame lists them: the six displays, or the one port. */
const namesOfRole = (board: BoardIo, role: Role): readonly string[] => (role === 'sevenSegment' ? board.sevenSegment : [board[role]]);

/** The board a `BOARD` body names; every role exactly once, every name checked. */
export function decodeBoardBody(body: string): DecodedBoard {
  const board = boardIn(body);
  if (typeof board === 'string') return rejected(board);
  const duplicate = duplicateName(board);
  return duplicate === undefined ? { ok: true, board } : rejected(`${JSON.stringify(duplicate)} is used twice (names ignore case)`);
}

type NamesByRole = Partial<Record<Role, readonly string[]>>;

const givesEveryRole = (names: NamesByRole): names is Record<Role, readonly string[]> => ROLES.every((role) => names[role] !== undefined);

/** The board a body names, or why it does not give every role exactly once (`parseLine` checked each count). */
function boardIn(body: string): BoardIo | string {
  const names: NamesByRole = {};
  for (const line of body.split('\n')) {
    const parsed = parseLine(line);
    if (typeof parsed === 'string') return parsed;
    if (names[parsed.role] !== undefined) return `${parsed.role} is given twice`;
    names[parsed.role] = parsed.names;
  }
  if (!givesEveryRole(names)) return `${ROLES.find((role) => names[role] === undefined)} is missing`;
  const { clock50, clock500Hz, switches, pushbuttons, leds, sevenSegment } = names;
  return { clock50: clock50[0], clock500Hz: clock500Hz[0], switches: switches[0], pushbuttons: pushbuttons[0], leds: leds[0], sevenSegment };
}

export function encodeBoardBody(board: BoardIo): string {
  return ROLES.map((role) => `${role} ${namesOfRole(board, role).join(' ')}`).join('\n');
}
