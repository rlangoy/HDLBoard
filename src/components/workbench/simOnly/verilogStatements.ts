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
 * constant bounds and a step of one, `q[i]` is each bit `i` runs over. A `case` is
 * complete with a `default`, or when its constant labels name every value of a selector
 * of known width. A `for` with constant bounds that runs at least once is its body; any
 * other loop may run no time.
 */

/** What a statement assigns, on some path and on every path through it. */
export interface Assigned {
  /** Where the statement ends in the text. */
  readonly end: number;
  /** Bits (`q[0]`), signals of unknown width (`q`), and bits known only while running (`q[?]`). */
  readonly some: ReadonlySet<string>;
  readonly every: ReadonlySet<string>;
}

/** A declared range: `[7:0]` is msb 7, lsb 0; a scalar is 0, 0. */
export interface BitRange {
  readonly msb: number;
  readonly lsb: number;
}

/** The code, and the declared range of a signal when the module declares it with numbers. */
export interface StatementContext {
  readonly text: string;
  readonly rangeOf: (name: string) => BitRange | undefined;
  /** The loop variables in scope, with the values each runs over. */
  readonly loops: ReadonlyMap<string, BitRange>;
}

const NOTHING: ReadonlySet<string> = new Set();
/** How wide a selector may be for its values to be counted: 2^8 labels at most. */
const MAX_COUNTED_WIDTH = 8;
/** How many bits a signal may have to be followed bit by bit; a wider one stays whole. */
const MAX_FOLLOWED_BITS = 256;
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

/** The text inside the brackets that open at `open` (offset of the `(` or `{`). */
function bracketed(text: string, open: number, [opening, closing]: string): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    depth += text[i] === opening ? 1 : text[i] === closing ? -1 : 0;
    if (depth === 0) return text.slice(open + 1, i);
  }
  return text.slice(open + 1);
}

/** The text inside the parentheses that open at `open` (offset of the `(`). */
export const parenthesized = (text: string, open: number): string => bracketed(text, open, '()');

/** The parentheses that open at the first `(` from `i`: what they hold, and the offset after them. */
function parentheses(text: string, i: number): { inside: string; after: number } {
  const open = text.indexOf('(', i);
  if (open < 0) return { inside: '', after: text.length };
  const inside = parenthesized(text, open);
  return { inside, after: open + inside.length + 2 };
}

/** The offset of a case item's `:`: the first one outside brackets and parentheses. */
function caseLabelEnd(text: string, i: number): number {
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    if ('([{'.includes(text[j])) depth++;
    else if (')]}'.includes(text[j])) depth--;
    else if (text[j] === ':' && depth === 0) return j;
    else if (text[j] === ';') return j;
  }
  return text.length;
}

/** The parts of a list at its top level: `a, {b, c}, d[1:0]` is three. */
function topLevelItems(list: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < list.length; i++) {
    if ('([{'.includes(list[i])) depth++;
    else if (')]}'.includes(list[i])) depth--;
    else if (list[i] === ',' && depth === 0) {
      items.push(list.slice(from, i));
      from = i + 1;
    }
  }
  return [...items, list.slice(from)];
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
    const inside = bracketed(s, at, '[]');
    indexes.push(inside);
    at = skipBlanks(s, at + inside.length + 2);
  }
  return { name, index: indexes[0], rest: s.slice(at) };
}

/** The bits one target names: `q`, `q[3]`, `q[3:0]`, `q[i]` of a loop, `q[idx]`. */
function targetBits(ctx: StatementContext, { name, index }: WrittenTarget): string[] {
  const whole = ctx.rangeOf(name);
  if (index === undefined) return (whole && bitsOf(name, whole)) ?? [name];
  const inside = index.replace(/\s+/g, '');
  const part = /^(\d+)(?::(\d+))?$/.exec(inside);
  const range = part ? { msb: Number(part[1]), lsb: Number(part[2] ?? part[1]) } : ctx.loops.get(inside);
  return (range && bitsOf(name, range)) ?? [`${name}${UNKNOWN_BIT}`];
}

const ASSIGNS = /^<?=(?!=)/;

/** What an assignment's left-hand side names, `{a, b[1:0]}` included; nothing for any other statement. */
function assignedBits(ctx: StatementContext, statement: string): string[] {
  const s = statement.trim();
  if (s.startsWith('{')) {
    const concatenation = bracketed(s, 0, '{}');
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

/** The value of a constant label (`2'b01`, `3`), or undefined for a wildcard (`2'b?1`) or a name. */
function labelValue(label: string): number | undefined {
  const plain = label.trim();
  if (/^\d+$/.test(plain)) return Number(plain);
  const m = BASED.exec(plain);
  return m ? parseInt(m[3].replace(/_/g, ''), RADIX[m[2].toLowerCase()]) : undefined;
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
function namesEveryValue(labels: readonly string[], width: number | undefined): boolean {
  if (width === undefined || width > MAX_COUNTED_WIDTH) return false;
  const values = labels.map(labelValue);
  const fits = values.every((v) => v !== undefined && v < 2 ** width);
  return fits && new Set(values).size === 2 ** width;
}

function caseStatement(ctx: StatementContext, i: number): Assigned {
  const { text } = ctx;
  const selector = parentheses(text, i);
  const items: Assigned[] = [];
  const labels: string[] = [];
  let hasDefault = false;
  let j = skipBlanks(text, selector.after);
  while (j < text.length && wordAt(text, j) !== 'endcase') {
    const labelEnd = caseLabelEnd(text, j);
    if (wordAt(text, j) === 'default') hasDefault = true;
    else labels.push(...text.slice(j, labelEnd).split(','));
    const item = statementAssigns(ctx, labelEnd + 1);
    items.push(item);
    j = skipBlanks(text, Math.max(item.end, j + 1));
  }
  const complete = hasDefault || namesEveryValue(labels, selectorWidth(selector.inside, ctx.rangeOf));
  const every = complete ? intersection(ctx, items.map((it) => it.every)) : NOTHING;
  return { end: j + 'endcase'.length, some: union(items.map((it) => it.some)), every };
}

const CONSTANT_FOR = /^\s*(\w+)\s*=\s*(\d+)\s*;\s*(\w+)\s*(<=|<|>=|>|!=)\s*(\d+)\s*;([^;]*)$/;
const HOLDS: Readonly<Record<string, (a: number, b: number) => boolean>> = {
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '!=': (a, b) => a !== b,
};
/** The last value the loop variable has inside the loop, for the condition and the first value. */
const LAST: Readonly<Record<string, (first: number, bound: number) => number>> = {
  '<': (_a, b) => b - 1,
  '<=': (_a, b) => b,
  '>': (_a, b) => b + 1,
  '>=': (_a, b) => b,
  '!=': (a, b) => (a < b ? b - 1 : b + 1),
};

/** `i = i + 1`, `i = i - 1`, `i++`, `i--`: a step of one. */
const stepsByOne = (step: string, name: string): boolean =>
  new RegExp(`^\\s*(?:${name}\\s*=\\s*${name}\\s*[+-]\\s*1|${name}\\s*(?:\\+\\+|--)|(?:\\+\\+|--)\\s*${name})\\s*$`).test(step);

/** A `for` with constant bounds: its variable, whether it surely runs, and the values it runs over in steps of one. */
function constantFor(header: string): { name: string; runs: boolean; values?: BitRange } | undefined {
  const m = CONSTANT_FOR.exec(header);
  if (m === null || m[1] !== m[3]) return undefined;
  const [first, bound, test] = [Number(m[2]), Number(m[5]), m[4]];
  const runs = HOLDS[test](first, bound);
  return { name: m[1], runs, values: runs && stepsByOne(m[6], m[1]) ? { msb: LAST[test](first, bound), lsb: first } : undefined };
}

/** A loop is its body when it surely runs; any other may run no time, and assigns on some path only. */
function loopStatement(ctx: StatementContext, i: number): Assigned {
  const header = parentheses(ctx.text, i);
  const loop = wordAt(ctx.text, i) === 'for' ? constantFor(header.inside) : undefined;
  const inner = loop?.values ? { ...ctx, loops: new Map([...ctx.loops, [loop.name, loop.values]]) } : ctx;
  const body = statementAssigns(inner, header.after);
  return { end: body.end, some: body.some, every: loop?.runs ? body.every : NOTHING };
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
  statementAssigns({ text, rangeOf: () => undefined, loops: new Map() }, from).end;

/** The targets some path leaves unassigned: each may keep its value. */
export function notAlwaysAssigned(ctx: StatementContext, assigned: Assigned): string[] {
  return [...assigned.some].filter((target) => !covers(ctx, assigned.every, target));
}
