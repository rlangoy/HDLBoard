// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * What HDLBoard needs to know about a Verilog design's top module — and, on purpose,
 * almost nothing more (docs/Verilog_implementation_plan.md § 5.1, § 5.4).
 *
 * Icarus itself reports a module's ports (`iverilog -tstub`, read by `parseStubPorts`
 * below), because a hand-written scanner gets real designs wrong: `` `ifdef``'d-out
 * ports, macro-sized widths, generate blocks, attributes (M22). The one thing left
 * to read from source is *which modules a file declares*, and this file's tiny scan
 * for that is the only place HDLBoard looks at Verilog text.
 *
 * Pure: no filesystem, no processes.
 */

import { BOARD_PORTS } from '../engines/boardPorts.js';

/**
 * Comments and string literals, matched leftmost-first so a `//` inside a string is
 * not a comment and a quote inside a comment is not a string. The last alternative
 * is a block comment that never closes: the compiler treats everything after it as
 * comment, so this does too.
 */
const COMMENT_OR_STRING = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:[^"\\\n]|\\.)*"|\/\*[\s\S]*$/g;

/** `endmodule` cannot match: `\b` needs a word boundary before `module`. */
const MODULE_DECLARATION = /\b(?:macro)?module\s+([A-Za-z_][A-Za-z0-9_$]*)/g;

/** The names of the modules a source file declares, in source order. */
export function moduleNames(source: string): string[] {
  const code = source.replace(COMMENT_OR_STRING, ' ');
  return [...code.matchAll(MODULE_DECLARATION)].map((match) => match[1] ?? '');
}

export type PortDirection = 'input' | 'output' | 'inout';

export interface Port {
  /** Exactly as the design spells it — matching against the board's names is the caller's job. */
  readonly name: string;
  readonly direction: PortDirection;
  readonly width: number;
}

/** A failure is a value, not an exception: bad input from the compiler is expected, not a bug. */
export type PortsResult =
  | { readonly ok: true; readonly ports: readonly Port[] }
  | { readonly ok: false; readonly reason: string };

/**
 * One port line of `iverilog -tstub`, e.g.
 * `  tri unsigned output logic[9:0] LEDR[word=0, adr=0]  <width=10> ...`:
 * net type, signedness, direction, data type (with its range glued on), then the name.
 * A signal that is not a port has no direction word, so it does not match.
 */
const STUB_PORT_LINE = /^\s+\S+\s+(?:un)?signed\s+(input|output|inout)\s+(\S+)\s+([^\s[]+)\[word=/;
const STUB_RANGE = /\[(\d+):(\d+)\]/;
const STUB_SCOPE_START = 'scope:';
const STUB_SCOPE_END = 'end scope';

function isScopeBoundary(line: string): boolean {
  return line.startsWith(STUB_SCOPE_START) || line.startsWith(STUB_SCOPE_END);
}

function widthOf(dataType: string): number {
  const range = STUB_RANGE.exec(dataType);
  return range ? Math.abs(Number(range[1]) - Number(range[2])) + 1 : 1;
}

function readPort(line: string): Port[] {
  const match = STUB_PORT_LINE.exec(line);
  if (!match) return [];
  const [, direction, dataType, name] = match;
  // The regex admits only these three words for `direction`.
  return [{ name: name ?? '', direction: direction as PortDirection, width: widthOf(dataType ?? '') }];
}

function portsOfScope(linesAfterScopeHeader: readonly string[]): Port[] {
  const end = linesAfterScopeHeader.findIndex(isScopeBoundary);
  const ownLines = end < 0 ? linesAfterScopeHeader : linesAfterScopeHeader.slice(0, end);
  return ownLines.flatMap(readPort);
}

function describeMissingScope(lines: readonly string[], top: string): string {
  const looksLikeStub = lines.some((line) => line.startsWith(STUB_SCOPE_START));
  return looksLikeStub
    ? `the iverilog -tstub output has no scope for module '${top}'`
    : 'the text is not iverilog -tstub output (it has no "scope:" line)';
}

/**
 * The ports of module `top` from `iverilog -tstub` output — the design as Icarus
 * elaborated it, so `` `ifdef``s, macros, parameters and generate blocks are already
 * resolved. Only the top's own scope counts; the child scopes that follow it (its
 * generate blocks and instances) are ignored, as are other root modules in the text.
 */
export function parseStubPorts(stubText: string, top: string): PortsResult {
  const lines = stubText.split(/\r?\n/);
  const header = lines.findIndex((line) => line.startsWith(`${STUB_SCOPE_START} ${top} `));
  if (header < 0) return { ok: false, reason: describeMissingScope(lines, top) };
  return { ok: true, ports: portsOfScope(lines.slice(header + 1)) };
}

/**
 * The board's port names, lower case, from the same list the VHDL scanner uses so the
 * two languages cannot disagree about what the board has. `rst` is left out: it is
 * VHDL-only legacy tolerance (§ 5.2), and there is no legacy Verilog to accommodate.
 */
const LEGACY_VHDL_PORT = 'rst';
const BOARD_PORT_NAMES: ReadonlySet<string> = new Set(BOARD_PORTS.filter((name) => name !== LEGACY_VHDL_PORT));

/**
 * The design's board ports, as `lower-case board name -> the spelling the design
 * declared`. Matching ignores case (Verilog identifiers are case-sensitive, VHDL's
 * are not, and `Clock_50` should not fail to connect where VHDL's would); the
 * declared spelling is kept because the generated instance must connect by it.
 */
export function boardPortSpellings(ports: readonly Port[]): Map<string, string> {
  const spellings = new Map<string, string>();
  for (const { name } of ports) {
    const boardName = name.toLowerCase();
    if (BOARD_PORT_NAMES.has(boardName)) spellings.set(boardName, name);
  }
  return spellings;
}

/**
 * True when the top declares at least one board port. "Has ports" is not the test:
 * a testbench can have ports of its own (§ 5.3).
 */
export function isBoardDesign(ports: readonly Port[]): boolean {
  return boardPortSpellings(ports).size > 0;
}

export type TopChoice =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly reason: string };

function withoutExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

function rejectAmbiguousTop(topFileName: string, names: readonly string[]): TopChoice {
  const fileStem = withoutExtension(topFileName);
  return {
    ok: false,
    reason:
      `Top file ${topFileName} declares ${names.length} modules (${names.join(', ')}) and none is named "${fileStem}". ` +
      'Name the top module after its file, or move the helper modules into their own files.',
  };
}

/**
 * Which module the top file stands for — the one rule of § 5.1: the file's only
 * module, else the one named like the file (ignoring case), else an error that lists
 * the candidates. Never a guess: a heuristic that picks a module the student did not
 * mean becomes a bug report, while a clear error costs one rename.
 */
export function chooseTopModule(topFileName: string, names: readonly string[]): TopChoice {
  const [first] = names;
  if (first === undefined) return { ok: false, reason: `Top file ${topFileName} declares no module.` };
  if (names.length === 1) return { ok: true, name: first };
  const stem = withoutExtension(topFileName).toLowerCase();
  const named = names.find((name) => name.toLowerCase() === stem);
  return named === undefined ? rejectAmbiguousTop(topFileName, names) : { ok: true, name: named };
}
