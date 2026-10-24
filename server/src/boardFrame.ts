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

import { LEGACY_RESET_PORT, SEVEN_SEGMENT_COUNT, type BoardIo } from './engines/boardPorts.js';

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
  const seen = new Set<string>();
  for (const role of ROLES) {
    const names = role === 'sevenSegment' ? board.sevenSegment : [board[role]];
    for (const name of names) {
      if (seen.has(name.toLowerCase())) return name;
      seen.add(name.toLowerCase());
    }
  }
  return undefined;
}

/** The board a `BOARD` body names; every role exactly once, every name checked. */
export function decodeBoardBody(body: string): DecodedBoard {
  const names = namesByRole(body);
  if (typeof names === 'string') return rejected(names);
  const board = boardOf(names);
  const duplicate = duplicateName(board);
  return duplicate === undefined ? { ok: true, board } : rejected(`${JSON.stringify(duplicate)} is used twice (names ignore case)`);
}

/** Each role's names, or why the body does not give every role exactly once. */
function namesByRole(body: string): Map<Role, string[]> | string {
  const names = new Map<Role, string[]>();
  for (const line of body.split('\n')) {
    const parsed = parseLine(line);
    if (typeof parsed === 'string') return parsed;
    if (names.has(parsed.role)) return `${parsed.role} is given twice`;
    names.set(parsed.role, parsed.names);
  }
  const missing = ROLES.find((role) => !names.has(role));
  return missing === undefined ? names : `${missing} is missing`;
}

/** The board from a complete set of names (`namesByRole` checked that every role is there). */
function boardOf(names: ReadonlyMap<Role, readonly string[]>): BoardIo {
  const namesOf = (role: Role): readonly string[] => {
    const found = names.get(role);
    if (found === undefined) throw new Error(`BOARD: ${role} was checked but is missing`);
    return found;
  };
  const single = (role: Exclude<Role, 'sevenSegment'>): string => namesOf(role)[0] ?? '';
  return {
    clock50: single('clock50'),
    clock500Hz: single('clock500Hz'),
    switches: single('switches'),
    pushbuttons: single('pushbuttons'),
    leds: single('leds'),
    sevenSegment: namesOf('sevenSegment'),
  };
}

export function encodeBoardBody(board: BoardIo): string {
  return ROLES.map((role) => `${role} ${(role === 'sevenSegment' ? board.sevenSegment : [board[role]]).join(' ')}`).join('\n');
}
