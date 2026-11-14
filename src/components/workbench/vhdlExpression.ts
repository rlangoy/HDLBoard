// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The parts of one line of VHDL that advice talks about: the assignment on it, the
 * `name(…)` parts (indexes, slices, conversions), and how many bits a value has.
 * Read by pattern; anything not understood gives `undefined`. Pure.
 */

import type { VhdlDeclarations } from './vhdlDeclarations';
import { lengthOf } from './vhdlDeclarations';
import { tokenizeVhdlLine } from './vhdlHighlight';
import { isReservedWord } from './vhdlWords';

/** A piece of a line: its text and 0-based offsets, end exclusive. */
export interface Piece {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export type AssignmentOperator = '<=' | ':=';

/** `count <= count + 1;`: the target as written (`v(i)` too), its name, and the value up to `when`, `after` or `;`. */
export interface Assignment {
  readonly target: Piece;
  readonly targetName: string;
  readonly operator: AssignmentOperator;
  readonly value: Piece;
}

/** `bits(index_value)`, `to_unsigned(5, 8)`: the name and what is between its parentheses. */
export interface NamedPart {
  readonly name: Piece;
  readonly inside: Piece;
  readonly whole: Piece;
}

const FILLER = '_';

/**
 * The line with its comment blanked and every literal's contents filled, the same
 * length: a `(`, `;` or `--` found in it is code, never part of a string.
 */
export function codeShape(line: string): string {
  return tokenizeVhdlLine(line)
    .map(({ text, type }) => {
      if (type === 'comment') return ' '.repeat(text.length);
      if (type === 'string') return `${text[0]}${FILLER.repeat(text.length - 2)}${text[text.length - 1]}`;
      return text;
    })
    .join('');
}

function pieceOf(line: string, start: number, end: number): Piece {
  const text = line.slice(start, end);
  const leading = text.length - text.trimStart().length;
  const trimmed = text.trim();
  return { text: trimmed, start: start + leading, end: start + leading + trimmed.length };
}

/** The index of the `)` that closes the `(` at `open`, in a code shape. */
function closingParenthesis(shape: string, open: number): number | undefined {
  let depth = 0;
  for (let i = open; i < shape.length; i++) {
    if (shape[i] === '(') depth++;
    else if (shape[i] === ')' && --depth === 0) return i;
  }
  return undefined;
}

/** Offsets in `shape` where `pattern` matches outside parentheses. */
function topLevelMatches(shape: string, pattern: RegExp): RegExpExecArray[] {
  const depthAt: number[] = [];
  let depth = 0;
  for (const char of shape) {
    if (char === ')') depth--;
    depthAt.push(depth);
    if (char === '(') depth++;
  }
  return [...shape.matchAll(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`))].filter(
    (match) => depthAt[match.index] === 0,
  );
}

/** `text` cut at every top-level match of `separator`; one part when there is none. */
export function splitTopLevel(text: string, separator: RegExp): string[] {
  const shape = codeShape(text);
  const parts: string[] = [];
  let start = 0;
  for (const match of topLevelMatches(shape, separator)) {
    if (match.index === 0) continue;
    parts.push(text.slice(start, match.index));
    start = match.index + match[0].length;
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim());
}

/** `(a & b)` → `a & b`, as often as the parentheses enclose all of it. */
export function withoutOuterParentheses(text: string): string {
  let inner = text.trim();
  while (inner.startsWith('(') && closingParenthesis(codeShape(inner), 0) === inner.length - 1) inner = inner.slice(1, -1).trim();
  return inner;
}

/** A label (`set:`) or a case choice (`when "11" =>`) in front of the target is skipped. */
const ASSIGNMENT = /^(?<label>\s*(?:when\b[^;]*?=>\s*)?(?:\w+\s*:\s*)?)(?<target>\w+(?:\s*\(.*?\))?)\s*(?<operator><=|:=)/i;
/** Where the value of an assignment ends: a condition, a delay, or the statement's end. */
const VALUE_END = /\bwhen\b|\bafter\b|;/i;

export function assignmentOn(line: string): Assignment | undefined {
  const shape = codeShape(line);
  const match = ASSIGNMENT.exec(shape);
  if (!match?.groups) return undefined;
  const { label, target, operator } = match.groups;
  const targetName = /^\w+/.exec(target)?.[0] ?? '';
  if (isReservedWord(targetName)) return undefined;
  const valueStart = match[0].length;
  const end = topLevelMatches(shape.slice(valueStart), VALUE_END)[0]?.index;
  const valueEnd = end === undefined ? shape.trimEnd().length : valueStart + end;
  return {
    target: pieceOf(line, label.length, label.length + target.length),
    targetName,
    operator: operator as AssignmentOperator,
    value: pieceOf(line, valueStart, valueEnd),
  };
}

const RETURN_STATEMENT = /^\s*return\s+/i;

/** The value of `return …;` on the line. */
export function returnValueOn(line: string): Piece | undefined {
  const shape = codeShape(line);
  const match = RETURN_STATEMENT.exec(shape);
  if (!match) return undefined;
  const end = shape.indexOf(';', match[0].length);
  return pieceOf(line, match[0].length, end < 0 ? shape.trimEnd().length : end);
}

/** Every `name(…)` on the line, outer ones first: indexes, slices and calls alike. */
export function namedParts(line: string): NamedPart[] {
  const shape = codeShape(line);
  const parts: NamedPart[] = [];
  for (const match of shape.matchAll(/\b(?<name>[A-Za-z]\w*)\s*\(/g)) {
    const open = match.index + match[0].length - 1;
    const close = closingParenthesis(shape, open);
    const name = match.groups?.name ?? '';
    if (close === undefined || isReservedWord(name)) continue;
    parts.push({
      name: pieceOf(line, match.index, match.index + name.length),
      inside: pieceOf(line, open + 1, close),
      whole: pieceOf(line, match.index, close + 1),
    });
  }
  return parts;
}

/** A range written in a slice: `7 downto 4`, `lo + 3 downto lo`. */
export function isRangeText(text: string): boolean {
  return topLevelMatches(codeShape(text), /\s(?:to|downto)\s/i).length === 1;
}

/** The names in an expression that are not reserved words: `high_index - 3` → `high_index`. */
export function namesIn(text: string): string[] {
  const names = tokenizeVhdlLine(text).filter((token) => token.type === 'identifier' || token.type === 'type');
  return [...new Set(names.map((token) => token.text).filter((name) => !isReservedWord(name)))];
}

const CONVERSIONS: ReadonlySet<string> = new Set(['std_logic_vector', 'std_ulogic_vector', 'unsigned', 'signed', 'bit_vector']);
/** `to_unsigned(5, 8)`, `resize(u, 4)`: the width is the second argument. */
const SIZED_CALLS: ReadonlySet<string> = new Set(['to_unsigned', 'to_signed', 'resize', 'to_slv']);
const SINGLE_BIT_TYPES: ReadonlySet<string> = new Set(['std_logic', 'std_ulogic', 'bit', 'boolean']);
const BIT_STRING = /^(?<base>[box])?"(?<digits>[^"]*)"$/i;
const BITS_PER_DIGIT: Readonly<Record<string, number>> = { b: 1, o: 3, x: 4 };
const CHARACTER_LITERAL = /^'.'$/;
const ADDING = /[+-]/;

/** How many bits the value `text` has, on `line`; undefined unless it is certain. */
export function widthOf(text: string, line: number, declarations: VhdlDeclarations): number | undefined {
  const expression = withoutOuterParentheses(text);
  const concatenated = splitTopLevel(expression, /&/);
  if (concatenated.length > 1) return sumOf(concatenated.map((part) => widthOf(part, line, declarations)));
  const added = splitTopLevel(expression, ADDING);
  if (added.length > 1) return widestOf(added, line, declarations);
  return literalWidth(expression) ?? nameWidth(expression, line, declarations) ?? partWidth(expression, line, declarations);
}

function sumOf(widths: readonly (number | undefined)[]): number | undefined {
  return widths.every((width) => width !== undefined) ? widths.reduce((a, b) => a + b, 0) : undefined;
}

/** `u + 1`: numeric_std gives the width of the widest vector; a number adds none. */
function widestOf(terms: readonly string[], line: number, declarations: VhdlDeclarations): number | undefined {
  const vectors = terms.filter((term) => declarations.valueOf(term, line) === undefined && !/^\d/.test(term));
  const widths = vectors.map((term) => widthOf(term, line, declarations));
  if (widths.length === 0 || widths.some((width) => width === undefined)) return undefined;
  return Math.max(...(widths as number[]));
}

function literalWidth(text: string): number | undefined {
  if (CHARACTER_LITERAL.test(text)) return 1;
  const bits = BIT_STRING.exec(text)?.groups;
  if (bits === undefined) return undefined;
  const digits = bits.digits.replace(/_/g, '').length;
  return digits * BITS_PER_DIGIT[(bits.base ?? 'b').toLowerCase()];
}

function nameWidth(text: string, line: number, declarations: VhdlDeclarations): number | undefined {
  if (!/^\w+$/.test(text)) return undefined;
  const type = declarations.typeAt(text, line);
  if (type?.kind === 'vector') return lengthOf(type.range);
  return type?.kind === 'scalar' && SINGLE_BIT_TYPES.has(type.name.toLowerCase()) ? 1 : undefined;
}

/** `std_logic_vector(x)`, `to_unsigned(5, 8)`, `a(7 downto 4)`, `mem(i)` — when the whole text is that one part. */
function partWidth(text: string, line: number, declarations: VhdlDeclarations): number | undefined {
  const [part] = namedParts(text);
  if (part === undefined || part.whole.start !== 0 || part.whole.end !== text.length) return undefined;
  const name = part.name.text.toLowerCase();
  const args = splitTopLevel(part.inside.text, /,/);
  if (CONVERSIONS.has(name) && args.length === 1) return widthOf(args[0], line, declarations);
  if (SIZED_CALLS.has(name) && args.length === 2) return declarations.valueOf(args[1], line);
  const type = declarations.typeAt(part.name.text, line);
  if (type?.kind !== 'vector') return undefined;
  if (isRangeText(part.inside.text)) return lengthOf(declarations.rangeOf(part.inside.text, line));
  return elementWidth(type.element, line, declarations);
}

/** One element of an array: a bit, or a vector of its own (`array (0 to 7) of std_logic_vector(7 downto 0)`). */
function elementWidth(element: string | undefined, line: number, declarations: VhdlDeclarations): number | undefined {
  if (element === undefined) return 1;
  const type = declarations.typeOf(element, line);
  if (type?.kind === 'vector') return lengthOf(type.range);
  return type?.kind === 'scalar' && SINGLE_BIT_TYPES.has(type.name.toLowerCase()) ? 1 : undefined;
}
