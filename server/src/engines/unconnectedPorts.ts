// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Inputs of the top entity that are not board inputs — a typo of `SW` such as `SdsW`,
 * or an extra `Dummy`. The board drives none of them. Pure.
 *
 * An input of a bit or vector type is held at 0 by the generated testbench, and the
 * design runs with a console warning that names its line (`tiedInputs`, `extraInputWarnings`),
 * as Quartus only warns about a top-level pin with no location. Any other extra input
 * is left open, GHDL rejects the testbench with `hdl_board_tb.vhdl:52:3:error: port
 * "X" of mode IN must be connected` — about an internal file the student cannot open
 * — and `explainUnconnectedPorts` moves that error onto the student's declaration.
 *
 * The error is written in GHDL's own `file:line:col:error:` shape, so the editor marks and
 * underlines it like any compiler message.
 */

import { BOARD_PORTS } from './boardPorts.js';

/**
 * GHDL's wording, and only on a line of the generated testbench: an error GHDL
 * reports in a file the student wrote is already shown on that file.
 */
const MUST_BE_CONNECTED =
  /^hdl_board_tb\.vhdl:\d+:\d+:error: (?<message>port "(?<name>[^"]+)" of mode (?:IN|INOUT) must be connected)/gim;

/** The board's inputs as the student writes them (§ 3.2); `rst` is legacy and never suggested. */
const BOARD_INPUTS: ReadonlyMap<string, string> = new Map([
  ['clock_50', 'CLOCK_50'],
  ['clock_500hz', 'CLOCK_500Hz'],
  ['sw', 'SW'],
  ['key_n', 'KEY_N'],
]);

const BOARD_PORT_NAMES: ReadonlySet<string> = new Set(BOARD_PORTS);

/** A single bit: held at `'0'`. */
const BIT_TYPES: ReadonlySet<string> = new Set(['std_logic', 'std_ulogic', 'bit']);
/** A constrained vector of bits: held at `(others => '0')`. */
const VECTOR_TYPES: ReadonlySet<string> = new Set(['std_logic_vector', 'std_ulogic_vector', 'bit_vector', 'unsigned', 'signed']);

/** From this length on, two edits are allowed: `SdsW` → `SW`, `KEY` → `KEY_N`. */
const TWO_EDIT_WORD_LENGTH = 3;

const GHDL_TAB_STOP = 8;

/** Levenshtein distance: insert, delete, substitute. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (const char of a) {
    const row = [previous[0] + 1];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (char === b[j - 1] ? 0 : 1));
    }
    previous = row;
  }
  return previous[b.length];
}

/**
 * The board input the student most likely meant: one the entity does not declare
 * already, starting with the same letter, within the edit allowance, and the only
 * one at the nearest distance.
 */
export function suggestBoardInput(name: string, declared: ReadonlySet<string>): string | undefined {
  const word = name.toLowerCase();
  const allowed = word.length >= TWO_EDIT_WORD_LENGTH ? 2 : 1;
  const scored = [...BOARD_INPUTS.keys()]
    .filter((port) => !declared.has(port) && port[0] === word[0])
    .map((port) => ({ port, distance: editDistance(word, port) }))
    .filter(({ distance }) => distance <= allowed);
  if (scored.length === 0) return undefined;
  const best = Math.min(...scored.map((s) => s.distance));
  const nearest = scored.filter((s) => s.distance === best);
  return nearest.length === 1 ? BOARD_INPUTS.get(nearest[0].port) : undefined;
}

/** The ports GHDL says are left open: the name as it printed it, and its sentence. */
export function unconnectedPorts(ghdlText: string): Array<{ name: string; message: string }> {
  return [...ghdlText.matchAll(MUST_BE_CONNECTED)].map((m) => ({
    name: m.groups?.name ?? '',
    message: m.groups?.message ?? '',
  }));
}

// ------------------------------------------------------------ reading the port clause

/** One name of the entity's port clause. */
export interface PortDeclaration {
  /** As written. */
  readonly name: string;
  /** Of the name in the source. */
  readonly offset: number;
  /** Lower case; `in` when the declaration names none. */
  readonly mode: string;
  /** The type mark, lower case, without a library prefix: `std_logic_vector`. */
  readonly type: string;
  /** A `(` follows the type mark: `std_logic_vector(9 downto 0)`. */
  readonly constrained: boolean;
  readonly hasDefault: boolean;
}

/** Comments blanked to spaces, so every offset still points at the same character of the source. */
function blankComments(src: string): string {
  return src.replace(/"[^"\n]*"|--[^\n]*|\/\*[\s\S]*?\*\//g, (text) =>
    text.startsWith('"') ? text : text.replace(/[^\n]/g, ' '),
  );
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The offset just after the `(` of `entityName`'s port clause, or `undefined` when it has none. */
function portClauseStart(code: string, entityName: string): number | undefined {
  const entity = new RegExp(`\\bentity\\s+${escapeRegExp(entityName)}\\s+is\\b`, 'i').exec(code);
  if (!entity) return undefined;
  const clauseOrEnd = /\b(?:port\s*\(|end\b|begin\b)/gi;
  clauseOrEnd.lastIndex = entity.index + entity[0].length;
  const found = clauseOrEnd.exec(code);
  return found && /^port/i.test(found[0]) ? found.index + found[0].length : undefined;
}

/** Each declaration of the port clause starting at `start`, with its offset: split at `;` outside nested parentheses. */
function declarationTexts(code: string, start: number): Array<{ offset: number; text: string }> {
  const declarations: Array<{ offset: number; text: string }> = [];
  let depth = 1;
  let offset = start;
  for (let i = start; i < code.length && depth > 0; i++) {
    if (code[i] === '(') depth++;
    else if (code[i] === ')') depth--;
    if ((code[i] === ';' && depth === 1) || depth === 0) {
      declarations.push({ offset, text: code.slice(offset, i) });
      offset = i + 1;
    }
  }
  return declarations;
}

const MODE_AND_TYPE = /^\s*(?:(?<mode>in|out|inout|buffer|linkage)\b)?\s*(?<type>[\w.]+)\s*(?<constraint>\()?/i;

/** `a, b : in std_logic := '0'` → one declaration per name. */
function parseDeclaration(offset: number, text: string): PortDeclaration[] {
  const colon = text.indexOf(':');
  if (colon < 0) return [];
  const rest = text.slice(colon + 1);
  const groups = MODE_AND_TYPE.exec(rest)?.groups ?? {};
  const shared = {
    mode: (groups.mode ?? 'in').toLowerCase(),
    type: (groups.type ?? '').toLowerCase().split('.').pop() ?? '',
    constrained: groups.constraint !== undefined,
    hasDefault: rest.includes(':='),
  };
  return [...text.slice(0, colon).matchAll(/\w+/g)].map((m) => ({ ...shared, name: m[0], offset: offset + (m.index ?? 0) }));
}

/** Every name of `entityName`'s port clause, in order; none when the clause cannot be found. */
export function portDeclarations(src: string, entityName: string): PortDeclaration[] {
  const code = blankComments(src);
  const start = portClauseStart(code, entityName);
  if (start === undefined) return [];
  return declarationTexts(code, start).flatMap(({ offset, text }) => parseDeclaration(offset, text));
}

/**
 * Where `portName` is declared in `entityName`'s port clause: the offset of the name
 * itself, or `undefined` when the clause or the name cannot be found.
 */
export function findPortDeclaration(src: string, entityName: string, portName: string): number | undefined {
  const wanted = portName.toLowerCase();
  return portDeclarations(src, entityName).find((port) => port.name.toLowerCase() === wanted)?.offset;
}

/** GHDL's 1-based line and column of `offset`: a tab advances to the next multiple of 8, other characters count their UTF-8 bytes. */
export function ghdlPosition(src: string, offset: number): { line: number; column: number } {
  const before = src.slice(0, offset);
  const line = before.split('\n').length;
  const lineText = before.slice(before.lastIndexOf('\n') + 1);
  let column = 1;
  for (const char of lineText) {
    column = char === '\t'
      ? Math.floor((column - 1) / GHDL_TAB_STOP) * GHDL_TAB_STOP + GHDL_TAB_STOP + 1
      : column + Buffer.byteLength(char, 'utf8');
  }
  return { line, column };
}

// ------------------------------------------------------------ extra inputs

export interface TopSource {
  readonly fileName: string;
  readonly content: string;
  readonly entityName: string;
  /** The entity's ports, lower case. */
  readonly ports: ReadonlySet<string>;
}

/** An extra input the testbench holds at 0: its declaration, and the VHDL value it is given. */
export interface TiedInput {
  readonly port: PortDeclaration;
  readonly value: string;
}

/** The constant 0 of the port's type, or `undefined` when it is not a bit or a constrained vector of bits. */
function zeroOf(port: PortDeclaration): string | undefined {
  if (BIT_TYPES.has(port.type) && !port.constrained) return "'0'";
  if (VECTOR_TYPES.has(port.type) && port.constrained) return "(others => '0')";
  return undefined;
}

/**
 * The inputs that are not board ports and that the testbench can hold at 0. An input
 * with a default value needs nothing (VHDL leaves it at that value), and an `inout`
 * cannot be given a constant, so neither is listed.
 */
export function tiedInputs(top: TopSource): TiedInput[] {
  return portDeclarations(top.content, top.entityName).flatMap((port) => {
    const extra = port.mode === 'in' && !port.hasDefault && !BOARD_PORT_NAMES.has(port.name.toLowerCase());
    const value = extra ? zeroOf(port) : undefined;
    return value === undefined ? [] : [{ port, value }];
  });
}

const code = (text: string): string => `\`${text}\``;

/** The board's inputs, for the detail line under the error. */
function boardInputsDetail(at: string, remedy: string): string {
  return `${at} (the board's inputs are ${[...BOARD_INPUTS.values()].join(', ')}; ${remedy})`;
}

/**
 * A console warning for each input the testbench holds at 0, with advice on a second
 * line. Deliberately not in GHDL's `file:line:col:` shape (it says `line 21` instead):
 * the editor marks only that shape, and a port meant for a testbench is no mistake, so
 * neither the line nor the file's tab should look like one.
 */
export function extraInputWarnings(top: TopSource, tied: readonly TiedInput[]): string[] {
  return tied.map(({ port }) => {
    const { line } = ghdlPosition(top.content, port.offset);
    const suggestion = suggestBoardInput(port.name, top.ports);
    const where = `${code(port.name)} (${top.fileName}, line ${line})`;
    const headline = suggestion
      ? `Warning: ${where} is not a board input — did you mean ${code(suggestion)}? The board holds it at 0.`
      : `Warning: ${where} is not a board input, so the board holds it at 0.`;
    const advice =
      `  Not a syntax error: a port like this is normal in a design meant for a testbench. ` +
      `To drive it, simulate a testbench that instantiates ${top.entityName}.`;
    return [headline, advice].join('\n');
  });
}

/**
 * GHDL-shaped errors on the student's own declarations, one per open input GHDL
 * names, each followed by `(…)` lines the editor shows as details. `undefined` when
 * the text is not about open ports, or a port cannot be found in the top file — the
 * caller then keeps GHDL's own text.
 */
export function explainUnconnectedPorts(ghdlText: string, top: TopSource): string | undefined {
  const open = unconnectedPorts(ghdlText);
  if (open.length === 0) return undefined;
  const lines: string[] = [];
  for (const { name, message } of open) {
    const offset = findPortDeclaration(top.content, top.entityName, name);
    if (offset === undefined) return undefined;
    const { line, column } = ghdlPosition(top.content, offset);
    const written = top.content.slice(offset, offset + name.length);
    const suggestion = suggestBoardInput(written, top.ports);
    const headline = suggestion
      ? `${code(written)} is not a board input — did you mean ${code(suggestion)}? Nothing on the board drives this port.`
      : `${code(written)} is not a board input, so nothing on the board drives it.`;
    const at = `${top.fileName}:${line}:${column}:error:`;
    lines.push(
      `${at} ${headline}`,
      boardInputsDetail(at, 'give the port a default value with := to keep it'),
      `${at} (GHDL: ${message})`,
    );
  }
  return lines.join('\n');
}
