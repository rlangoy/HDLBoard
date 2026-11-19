// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Verilog statements as the register checks need them (docs/impl_sim_only_warnings.md
 * § 3.4): where one ends, and what it assigns on some path and on every path through it
 * — `begin … end`, `if` / `else`, `case`, loops. Read from blanked code (no comments, no
 * strings). Pure.
 *
 * What a statement assigns is kept per bit: `q[3:0]` is `q[0]` … `q[3]`, and `q` is each
 * of its declared bits. A signal whose width is not known stays whole (`q`), and covers
 * any bit of it. A bit only known while running (`q[idx]`) is `q[?]`: it covers no bit,
 * so a path that writes only it leaves the others as they were. Inside a `for` with
 * bounds and a step known before running (numbers, parameters, localparams), an index
 * made of the loop variables, constants and numbers (`q[i]`, `r[7 - i]`, `q[2*i + 1]`) is
 * each bit it names as the loop runs. A `case` is complete with a `default` (with or
 * without its colon), or when its constant labels name every value of a selector of known
 * width. A `for` with constant bounds that runs at least once is its body; any
 * other loop may run no time.
 */

import { bracketed, topLevel, topLevelItems } from './brackets';
import { everyBinding, integerValue, type Bindings } from './constantIndex';
import type { BitRange } from './verilogDeclarations';

/** What a statement assigns, on some path and on every path through it. */
export interface Assigned {
  /** Where the statement ends in the text. */
  readonly end: number;
  /** Bits (`q[0]`), signals of unknown width (`q`), and bits known only while running (`q[?]`). */
  readonly some: ReadonlySet<string>;
  readonly every: ReadonlySet<string>;
}

/** The code, the declared range of a signal when it is known, and the module's constants. */
export interface StatementContext {
  readonly text: string;
  readonly rangeOf: (name: string) => BitRange | undefined;
  /** Parameters and localparams with a known value (`N = 8`): loop bounds and indexes may use them. */
  readonly constants: Bindings;
  /** The loop variables in scope, with the values each runs over. */
  readonly loops: ReadonlyMap<string, readonly number[]>;
  /**
   * Filled while walking: the bits the check could not follow, as `q[1]` or `q[?]` (what a
   * loop whose bounds or step are not known writes, an index of a loop variable through a
   * function). What they keep is not known either, so they get no latch warning: unsure is
   * quiet. The other bits of the signal are judged as usual.
   */
  readonly unsure: Set<string>;
}

const NOTHING: ReadonlySet<string> = new Set();
/** How wide a selector may be for its values to be counted: 2^8 labels at most. */
const MAX_COUNTED_WIDTH = 8;
/** How many bits a signal may have to be followed one by one; a wider one stays whole. */
const MAX_FOLLOWED_BITS = 256;
/** How many runs a loop, or all the loops around a statement together, may have to be followed. */
const MAX_LOOP_RUNS = 4096;
const UNKNOWN_BIT = '[?]';

/** The signal of a target: `q` for `q[0]`. */
export const signalOf = (target: string): string => target.replace(/\[.*$/, '');

const bitsOf = (name: string, { msb, lsb }: BitRange): string[] | undefined => {
  const [low, high] = [Math.min(msb, lsb), Math.max(msb, lsb)];
  if (high - low + 1 > MAX_FOLLOWED_BITS) return undefined;
  return Array.from({ length: high - low + 1 }, (_, k) => `${name}[${low + k}]`);
};

/**
 * Whether `assigned` covers the target: the target, or its whole signal. A `q[?]` is
 * covered only by the whole of `q`: writing a bit known only while running leaves the
 * others as they were, even on every path.
 */
function covers(ctx: StatementContext, assigned: ReadonlySet<string>, target: string): boolean {
  const signal = signalOf(target);
  if (assigned.has(signal)) return true;
  if (!target.endsWith(UNKNOWN_BIT)) return assigned.has(target);
  const range = ctx.rangeOf(signal);
  const bits = range === undefined ? undefined : bitsOf(signal, range);
  return bits !== undefined && bits.every((bit) => assigned.has(bit));
}

const union = (sets: readonly ReadonlySet<string>[]): Set<string> => new Set(sets.flatMap((s) => [...s]));
/** What every one of the sets covers. */
function intersection(ctx: StatementContext, sets: readonly ReadonlySet<string>[]): Set<string> {
  if (sets.length === 0) return new Set();
  return new Set([...union(sets)].filter((target) => sets.every((s) => covers(ctx, s, target))));
}

const skipBlanks = (text: string, i: number): number => {
  while (i < text.length && /\s/.test(text[i])) i++;
  return i;
};
const wordAt = (text: string, i: number): string => /^[A-Za-z_]\w*/.exec(text.slice(i))?.[0] ?? '';

/** The parentheses that open at the first `(` from `i`: what they hold, and the offset after them. */
function parentheses(text: string, i: number): { inside: string; after: number } {
  const open = text.indexOf('(', i);
  if (open < 0) return { inside: '', after: text.length };
  const inside = bracketed(text, open);
  return { inside, after: open + inside.length + 2 };
}

/** The offset of a case item's `:` (the first one outside brackets), or of the `;` that ends an item without one. */
function caseLabelEnd(text: string, i: number): number {
  const semicolon = text.indexOf(';', i);
  const item = topLevel(text.slice(i, semicolon < 0 ? text.length : semicolon));
  const colon = item.indexOf(':');
  return i + (colon < 0 ? item.length : colon);
}

/** A target as written: its name, its first index (`3:0`, `i`, `SW[1:0]`), and the text after its indexes. */
interface WrittenTarget {
  readonly name: string;
  readonly index?: string;
  readonly rest: string;
}

function writtenTarget(text: string): WrittenTarget | undefined {
  const s = text.trim();
  const name = /^[A-Za-z_]\w*/.exec(s)?.[0];
  if (name === undefined) return undefined;
  let at = skipBlanks(s, name.length);
  const indexes: string[] = [];
  while (s[at] === '[') {
    const inside = bracketed(s, at);
    indexes.push(inside);
    at = skipBlanks(s, at + inside.length + 2);
  }
  return { name, index: indexes[0], rest: s.slice(at) };
}

/** `base +: width` and `base -: width`, at the top level of an index. */
const INDEXED_PART = /^([^:]*)([+-]):([^:]*)$/;

/** The bits an index names with the loop variables at one set of values: `7 - i`, `2*i + 1 : 2*i`, `8*i +: 8`. */
function indexRange(index: string, bindings: Bindings): BitRange | undefined {
  const part = INDEXED_PART.exec(topLevel(index));
  if (part) return indexedPart(index, part, bindings);
  const [msbText, lsbText, ...more] = topLevelItems(index, ':');
  if (more.length > 0) return undefined;
  const msb = integerValue(msbText, bindings);
  const lsb = lsbText === undefined ? msb : integerValue(lsbText, bindings);
  return msb === undefined || lsb === undefined ? undefined : { msb, lsb };
}

/** `8*i +: 8` is bits 8*i to 8*i + 7; `top -: 4` is top - 3 to top. */
function indexedPart(index: string, part: RegExpExecArray, bindings: Bindings): BitRange | undefined {
  const base = integerValue(index.slice(0, part[1].length), bindings);
  const width = integerValue(index.slice(part[1].length + 2), bindings);
  if (base === undefined || width === undefined || width < 1) return undefined;
  return part[2] === '+' ? { msb: base + width - 1, lsb: base } : { msb: base, lsb: base - width + 1 };
}

/** The bits one target names: `q`, `q[3]`, `q[3:0]`, `q[7 - i]` in a loop; `q[?]` for an index known only while running. */
function targetBits(ctx: StatementContext, { name, index }: WrittenTarget): string[] {
  const whole = ctx.rangeOf(name);
  if (index === undefined) return (whole && bitsOf(name, whole)) ?? [name];
  return followedBits(ctx, name, index) ?? unknownBit(ctx, name, index);
}

/** The bits an index names for every run of the loops around, or undefined when one of them is not known. */
function followedBits(ctx: StatementContext, name: string, index: string): string[] | undefined {
  const bindings = everyBinding(ctx.loops, ctx.constants, MAX_LOOP_RUNS);
  if (bindings === undefined) return undefined;
  const bits: string[] = [];
  for (const b of bindings) {
    const range = indexRange(index, b);
    const named = range && bitsOf(name, range);
    if (!named) return undefined;
    bits.push(...named);
  }
  return bits;
}

/**
 * `q[?]`: a bit known only while running. When the index uses a loop variable (`q[f(i)]`,
 * or loops too many to follow), the loop may well write every bit: the check is unsure.
 */
function unknownBit(ctx: StatementContext, name: string, index: string): string[] {
  const usesALoop = [...ctx.loops.keys()].some((loop) => new RegExp(`\\b${loop}\\b`).test(index));
  const bit = `${name}${UNKNOWN_BIT}`;
  if (usesALoop) ctx.unsure.add(bit);
  return [bit];
}

const ASSIGNS = /^<?=(?!=)/;

/** What an assignment's left-hand side names, `{a, b[1:0]}` included; nothing for any other statement. */
function assignedBits(ctx: StatementContext, statement: string): string[] {
  const s = statement.trim();
  if (s.startsWith('{')) {
    const concatenation = bracketed(s, 0);
    if (!ASSIGNS.test(s.slice(concatenation.length + 2).trim())) return [];
    const targets = topLevelItems(concatenation).map(writtenTarget);
    return targets.flatMap((t) => (t === undefined ? [] : targetBits(ctx, t)));
  }
  const target = writtenTarget(s);
  return target !== undefined && ASSIGNS.test(target.rest) ? targetBits(ctx, target) : [];
}

function simpleStatement(ctx: StatementContext, i: number): Assigned {
  const semicolon = ctx.text.indexOf(';', i);
  const end = semicolon < 0 ? ctx.text.length : semicolon + 1;
  const assigned = new Set(assignedBits(ctx, ctx.text.slice(i, end)));
  return { end, some: assigned, every: assigned };
}

function blockStatement(ctx: StatementContext, i: number): Assigned {
  const { text } = ctx;
  let j = skipBlanks(text, i + 'begin'.length);
  if (text[j] === ':') {
    j = skipBlanks(text, j + 1);
    j += wordAt(text, j).length; // begin : name
  }
  const parts: Assigned[] = [];
  for (j = skipBlanks(text, j); j < text.length && wordAt(text, j) !== 'end'; j = skipBlanks(text, j)) {
    const part = statementAssigns(ctx, j);
    parts.push(part);
    j = Math.max(part.end, j + 1);
  }
  return { end: j + 'end'.length, some: union(parts.map((p) => p.some)), every: union(parts.map((p) => p.every)) };
}

function ifStatement(ctx: StatementContext, i: number): Assigned {
  const then = statementAssigns(ctx, parentheses(ctx.text, i).after);
  const next = skipBlanks(ctx.text, then.end);
  if (wordAt(ctx.text, next) !== 'else') return { end: then.end, some: then.some, every: NOTHING };
  const otherwise = statementAssigns(ctx, next + 'else'.length);
  return { end: otherwise.end, some: union([then.some, otherwise.some]), every: intersection(ctx, [then.every, otherwise.every]) };
}

const BASED = /^(\d+)?\s*'[sS]?([bBoOdDhH])\s*([0-9a-fA-F_]+)$/;
const RADIX: Readonly<Record<string, number>> = { b: 2, o: 8, d: 10, h: 16 };

/** The value of a constant label (`2'b01`, `3`, a parameter `S1`), or undefined for a wildcard (`2'b?1`) or a signal. */
function labelValue(label: string, constants: Bindings): number | undefined {
  const plain = label.trim();
  if (/^\d+$/.test(plain)) return Number(plain);
  const m = BASED.exec(plain);
  return m ? parseInt(m[3].replace(/_/g, ''), RADIX[m[2].toLowerCase()]) : integerValue(plain, constants);
}

/** The width of a case selector: a declared signal, one bit of it, or a constant part of it. */
function selectorWidth(selector: string, rangeOf: StatementContext['rangeOf']): number | undefined {
  const s = selector.replace(/\s+/g, '');
  const whole = /^[A-Za-z_]\w*$/.test(s) ? rangeOf(s) : undefined;
  if (whole) return Math.abs(whole.msb - whole.lsb) + 1;
  if (/^[A-Za-z_]\w*\[\d+\]$/.test(s)) return 1;
  const part = /^[A-Za-z_]\w*\[(\d+):(\d+)\]$/.exec(s);
  return part ? Math.abs(Number(part[1]) - Number(part[2])) + 1 : undefined;
}

/** Whether the labels name every value the selector can have, and nothing else. */
function namesEveryValue(labels: readonly string[], width: number | undefined, constants: Bindings): boolean {
  if (width === undefined || width > MAX_COUNTED_WIDTH) return false;
  const values = labels.map((label) => labelValue(label, constants));
  const fits = values.every((v) => v !== undefined && v >= 0 && v < 2 ** width);
  return fits && new Set(values).size === 2 ** width;
}

/** The offset of a `default` item's `:`, or of its last letter when it has none (`default q = 0;` is Verilog too). */
function defaultEnd(text: string, i: number): number {
  const after = skipBlanks(text, i + 'default'.length);
  return text[after] === ':' ? after : i + 'default'.length - 1;
}

function caseStatement(ctx: StatementContext, i: number): Assigned {
  const { text } = ctx;
  const selector = parentheses(text, i);
  const items: Assigned[] = [];
  const labels: string[] = [];
  let hasDefault = false;
  let j = skipBlanks(text, selector.after);
  while (j < text.length && wordAt(text, j) !== 'endcase') {
    const isDefault = wordAt(text, j) === 'default';
    const labelEnd = isDefault ? defaultEnd(text, j) : caseLabelEnd(text, j);
    if (isDefault) hasDefault = true;
    else labels.push(...topLevelItems(text.slice(j, labelEnd)));
    const item = statementAssigns(ctx, labelEnd + 1);
    items.push(item);
    j = skipBlanks(text, Math.max(item.end, j + 1));
  }
  const complete = hasDefault || namesEveryValue(labels, selectorWidth(selector.inside, ctx.rangeOf), ctx.constants);
  const every = complete ? intersection(ctx, items.map((it) => it.every)) : NOTHING;
  return { end: j + 'endcase'.length, some: union(items.map((it) => it.some)), every };
}

const CONSTANT_FOR = /^\s*(?:(?:integer|int|genvar)\s+)?([A-Za-z_]\w*)\s*=\s*([^;]+);\s*([A-Za-z_]\w*)\s*(<=|<|>=|>|!=)\s*([^;]+);([^;]*)$/;
const HOLDS: Readonly<Record<string, (a: number, b: number) => boolean>> = {
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '!=': (a, b) => a !== b,
};

/** The constant step of `i = i + 2`, `i += STEP`, `i = i + 4'd1`, `i++`, `--i`; undefined for any other. */
function stepOf(step: string, name: string, constants: Bindings): number | undefined {
  const s = step.replace(/\s+/g, '');
  const counted = new Map([[`${name}++`, 1], [`++${name}`, 1], [`${name}--`, -1], [`--${name}`, -1]]).get(s);
  if (counted !== undefined) return counted;
  const m = new RegExp(`^${name}(?:=${name}([+-])|([+-])=)(.+)$`).exec(s);
  const amount = m ? integerValue(m[3], constants) : undefined;
  if (m === null || amount === undefined) return undefined;
  return (m[1] ?? m[2]) === '-' ? -amount : amount;
}

/** A `for` with constant bounds: its variable, whether it surely runs, and the values it runs over when they are known. */
function constantFor(header: string, constants: Bindings): { name: string; runs: boolean; values?: number[] } | undefined {
  const m = CONSTANT_FOR.exec(header);
  if (m === null || m[1] !== m[3]) return undefined;
  const [first, bound, holds] = [integerValue(m[2], constants), integerValue(m[5], constants), HOLDS[m[4]]];
  if (first === undefined || bound === undefined) return undefined;
  const step = stepOf(m[6], m[1], constants);
  return { name: m[1], runs: holds(first, bound), values: step === undefined ? undefined : loopValues(first, step, (v) => holds(v, bound)) };
}

/** The values a loop variable takes, or undefined when the loop runs too long to follow (or forever). */
function loopValues(first: number, step: number, holds: (v: number) => boolean): number[] | undefined {
  if (step === 0) return undefined;
  const values: number[] = [];
  for (let v = first; holds(v); v += step) {
    if (values.length === MAX_LOOP_RUNS) return undefined;
    values.push(v);
  }
  return values;
}

/** A loop is its body when it surely runs; any other may run no time, and assigns on some path only. */
function loopStatement(ctx: StatementContext, i: number): Assigned {
  const header = parentheses(ctx.text, i);
  const loop = wordAt(ctx.text, i) === 'for' ? constantFor(header.inside, ctx.constants) : undefined;
  const values = loop?.values;
  const inner = loop && values ? { ...ctx, loops: new Map([...ctx.loops, [loop.name, values]]) } : ctx;
  const body = statementAssigns(inner, header.after);
  if (!values) markUnsure(ctx, body.some);
  return { end: body.end, some: body.some, every: loop?.runs ? body.every : NOTHING };
}

/** What a loop the check cannot run writes (bounds like `$clog2(N)`, `while`, `repeat`): it may be any of those bits. */
function markUnsure(ctx: StatementContext, written: ReadonlySet<string>): void {
  for (const target of written) ctx.unsure.add(target);
}

/** The statements that hold others, by their first word; any other statement is simple. A Map: a name like `toString` is no keyword. */
const STATEMENT_BY_KEYWORD: ReadonlyMap<string, (ctx: StatementContext, i: number) => Assigned> = new Map([
  ['begin', blockStatement],
  ['if', ifStatement],
  ['case', caseStatement],
  ['casez', caseStatement],
  ['casex', caseStatement],
  ['for', loopStatement],
  ['while', loopStatement],
  ['repeat', loopStatement],
]);

/** What the statement at `from` assigns, on some path and on every path, and where it ends. */
export function statementAssigns(ctx: StatementContext, from: number): Assigned {
  const i = skipBlanks(ctx.text, from);
  if (i >= ctx.text.length) return { end: ctx.text.length, some: NOTHING, every: NOTHING };
  if (ctx.text[i] === ';') return { end: i + 1, some: NOTHING, every: NOTHING };
  return (STATEMENT_BY_KEYWORD.get(wordAt(ctx.text, i)) ?? simpleStatement)(ctx, i);
}

/** Where the statement at `from` ends. */
export const statementEnd = (text: string, from: number): number =>
  statementAssigns({ text, rangeOf: () => undefined, constants: new Map(), loops: new Map(), unsure: new Set() }, from).end;

/** The targets some path leaves unassigned: each may keep its value. */
export function notAlwaysAssigned(ctx: StatementContext, assigned: Assigned): string[] {
  return [...assigned.some].filter((target) => !covers(ctx, assigned.every, target));
}
