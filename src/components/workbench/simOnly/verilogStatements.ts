// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Verilog statements as the register checks need them (docs/impl_sim_only_warnings.md
 * § 3.4): where one ends, and what it assigns on some path and on every path through it
 * — `begin … end`, `if` / `else`, `case`, loops. Read from blanked code (no comments, no
 * strings). Pure.
 *
 * What a statement assigns is kept per signal, or per bit for a constant index: `q[0]`
 * and `q[1]` are two, and `q` (or `q[i]`, whose bit is only known while running) covers
 * them all. A `case` is complete with a `default`, or when its constant labels name every
 * value of a selector of known width. A `for` with constant bounds that runs at least
 * once is its body; any other loop may run no time.
 */

/** What a statement assigns, on some path and on every path through it. */
export interface Assigned {
  /** Where the statement ends in the text. */
  readonly end: number;
  /** Signals (`q`) and bits (`q[0]`, `q[3:0]`). */
  readonly some: ReadonlySet<string>;
  readonly every: ReadonlySet<string>;
}

/** The code, and the declared width of a signal, when the module declares it. */
export interface StatementContext {
  readonly text: string;
  readonly widthOf: (name: string) => number | undefined;
}

const NOTHING: ReadonlySet<string> = new Set();
/** How wide a selector may be for its values to be counted: 2^8 labels at most. */
const MAX_COUNTED_WIDTH = 8;

/** The signal of a target: `q` for `q[0]`. */
export const signalOf = (target: string): string => target.replace(/\[.*$/, '');

/** Whether `assigned` covers the target: the target itself, or its whole signal. */
const covers = (assigned: ReadonlySet<string>, target: string): boolean => assigned.has(target) || assigned.has(signalOf(target));

const union = (sets: readonly ReadonlySet<string>[]): Set<string> => new Set(sets.flatMap((s) => [...s]));
/** What every one of the sets covers. */
function intersection(sets: readonly ReadonlySet<string>[]): Set<string> {
  if (sets.length === 0) return new Set();
  return new Set([...union(sets)].filter((target) => sets.every((s) => covers(s, target))));
}

const skipBlanks = (text: string, i: number): number => {
  while (i < text.length && /\s/.test(text[i])) i++;
  return i;
};
const wordAt = (text: string, i: number): string => /^[A-Za-z_]\w*/.exec(text.slice(i))?.[0] ?? '';

/** The text inside the parentheses that open at `open` (offset of the `(`). */
export function parenthesized(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    depth += text[i] === '(' ? 1 : text[i] === ')' ? -1 : 0;
    if (depth === 0) return text.slice(open + 1, i);
  }
  return text.slice(open + 1);
}

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

const ASSIGNMENT = /^([A-Za-z_]\w*)\s*(\[[^\]]*\])?(?:\s*\[[^\]]*\])*\s*<?=(?!=)/;
const CONSTANT_INDEX = /^\[\s*\d+\s*(?::\s*\d+\s*)?\]$/;

/** `q` for `q <= …` and `q[i] <= …`, `q[0]` for `q[0] <= …`. */
function targetOf(statement: string): string | undefined {
  const m = ASSIGNMENT.exec(statement.trim());
  if (!m) return undefined;
  const index = m[2]?.replace(/\s+/g, '');
  return index !== undefined && CONSTANT_INDEX.test(index) ? `${m[1]}${index}` : m[1];
}

function simpleStatement({ text }: StatementContext, i: number): Assigned {
  const semicolon = text.indexOf(';', i);
  const end = semicolon < 0 ? text.length : semicolon + 1;
  const target = targetOf(text.slice(i, end));
  const assigned = target === undefined ? NOTHING : new Set([target]);
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
  return { end: otherwise.end, some: union([then.some, otherwise.some]), every: intersection([then.every, otherwise.every]) };
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
function selectorWidth(selector: string, widthOf: StatementContext['widthOf']): number | undefined {
  const s = selector.replace(/\s+/g, '');
  if (/^[A-Za-z_]\w*$/.test(s)) return widthOf(s);
  if (/^[A-Za-z_]\w*\[\d+\]$/.test(s)) return 1;
  const part = /^[A-Za-z_]\w*\[(\d+):(\d+)\]$/.exec(s);
  return part ? Math.abs(Number(part[1]) - Number(part[2])) + 1 : undefined;
}

/** Whether the labels name every value of the selector. */
function namesEveryValue(labels: readonly string[], width: number | undefined): boolean {
  if (width === undefined || width > MAX_COUNTED_WIDTH) return false;
  const values = new Set(labels.map(labelValue));
  return !values.has(undefined) && values.size === 2 ** width;
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
  const complete = hasDefault || namesEveryValue(labels, selectorWidth(selector.inside, ctx.widthOf));
  const every = complete ? intersection(items.map((it) => it.every)) : NOTHING;
  return { end: j + 'endcase'.length, some: union(items.map((it) => it.some)), every };
}

const CONSTANT_FOR = /^\s*(\w+)\s*=\s*(\d+)\s*;\s*(\w+)\s*(<=|<|>=|>|!=)\s*(\d+)\s*;/;
const HOLDS: Readonly<Record<string, (a: number, b: number) => boolean>> = {
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '!=': (a, b) => a !== b,
};

/** `for (i = 0; i < 4; …)`: constant bounds, and the condition holds at the start. */
function runsAtLeastOnce(header: string): boolean {
  const m = CONSTANT_FOR.exec(header);
  return m !== null && m[1] === m[3] && HOLDS[m[4]](Number(m[2]), Number(m[5]));
}

/** A loop is its body when it surely runs; any other may run no time, and assigns on some path only. */
function loopStatement(ctx: StatementContext, i: number): Assigned {
  const header = parentheses(ctx.text, i);
  const body = statementAssigns(ctx, header.after);
  const surely = wordAt(ctx.text, i) === 'for' && runsAtLeastOnce(header.inside);
  return { end: body.end, some: body.some, every: surely ? body.every : NOTHING };
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

/** The targets some path leaves unassigned: each may keep its value. */
export function notAlwaysAssigned(assigned: Assigned): string[] {
  return [...assigned.some].filter((target) => !covers(assigned.every, target));
}
