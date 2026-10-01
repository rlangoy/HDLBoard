// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Turns GHDL's complaint about the generated testbench — `hdl_board_tb.vhdl:52:3:error:
 * port "SdsW" of mode IN must be connected` — into an error on the student's own port
 * declaration. The testbench only connects the board's ports, so an input with any
 * other name (a typo of `SW`, a made-up `BTN`) is left open, and GHDL says so about an
 * internal file the student cannot open; the editor drops that line. Here the port is
 * found in the top file and reported there, in GHDL's own `file:line:col:error:` shape,
 * so the editor marks and underlines it like any compile error. Pure.
 */

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
function portDeclarations(code: string, start: number): Array<{ offset: number; text: string }> {
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

/**
 * Where `portName` is declared in `entityName`'s port clause: the offset of the name
 * itself, or `undefined` when the clause or the name cannot be found.
 */
export function findPortDeclaration(src: string, entityName: string, portName: string): number | undefined {
  const code = blankComments(src);
  const start = portClauseStart(code, entityName);
  if (start === undefined) return undefined;
  const wanted = portName.toLowerCase();
  for (const { offset, text } of portDeclarations(code, start)) {
    const names = text.slice(0, Math.max(text.indexOf(':'), 0));
    const name = [...names.matchAll(/\w+/g)].find((m) => m[0].toLowerCase() === wanted);
    if (name) return offset + (name.index ?? 0);
  }
  return undefined;
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

export interface TopSource {
  readonly fileName: string;
  readonly content: string;
  readonly entityName: string;
  /** The entity's ports, lower case. */
  readonly ports: ReadonlySet<string>;
}

const code = (text: string): string => `\`${text}\``;

/**
 * GHDL-shaped errors on the student's own declarations, one per open input GHDL
 * names, each followed by `(…)` lines the editor shows as details. `undefined` when
 * the text is not about open ports, or a port cannot be found in the top file — the
 * caller then keeps GHDL's own text.
 */
export function explainUnconnectedPorts(ghdlText: string, top: TopSource): string | undefined {
  const open = unconnectedPorts(ghdlText);
  if (open.length === 0) return undefined;
  const inputs = [...BOARD_INPUTS.values()].join(', ');
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
      `${at} (the board's inputs are ${inputs}; give the port a default value with := to keep it)`,
      `${at} (GHDL: ${message})`,
    );
  }
  return lines.join('\n');
}
