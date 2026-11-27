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

import { bracketed, closingBracket, topLevel, topLevelItems, unwrapped } from './brackets';
import { everyBinding, integerValue, UNSIZED_LITERAL_WIDTH, valueOfName, type Bindings } from './constantIndex';
import { NO_FULL_CASE, type FullCaseMarks } from '../tbDetect/blank';
import type { BitRange } from './verilogDeclarations';

/** What a statement assigns, on some path and on every path through it. */
export interface Assigned {
  /** Where the statement ends in the text. */
  readonly end: number;
  /** Bits (`q[0]`), signals of unknown width (`q`), and bits known only while running (`q[?]`). */
  readonly some: ReadonlySet<string>;
  readonly every: ReadonlySet<string>;
  /**
   * The signals every path writes something of: wholly, a bit, or bits the check cannot
   * follow (`q[?]`, a loop it cannot run). A whole signal whose width is not known is
   * unsure only when every path may write it; a path that writes nothing of it keeps it.
   */
  readonly cover: ReadonlySet<string>;
}

/** The signals of `targets`: `q` for `q[0]` and `q[?]`. */
const signalsOf = (targets: ReadonlySet<string>): Set<string> => new Set([...targets].map(signalOf));

/** What every one of the sets holds, by name. */
const common = (sets: readonly ReadonlySet<string>[]): Set<string> =>
  sets.length === 0 ? new Set() : new Set([...sets[0]].filter((name) => sets.every((s) => s.has(name))));

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
  /**
   * The names fixed when synthesis elaborates the module but not known to the check: its
   * genvars (one value in each copy a `generate` loop makes) and parameters. An index made
   * of them (`q[i]`, `q[W-1:E]`) names the same bits on every path.
   */
  readonly fixedNames?: ReadonlySet<string>;
  /**
   * Offsets in `text` where `full_case` marks start (`blank.ts`). Synthesis takes the `case`
   * one marks as naming every value: it builds no latch for it.
   */
  readonly fullCase?: FullCaseMarks;
  /**
   * Elaboration conditions (`if (R == 2)`, `if (i == 0)` in a generate copy) decided for one
   * configuration of the module, by their text without blanks. A condition not in the map
   * is read as any other `if`: either branch may run.
   */
  readonly decisions?: ReadonlyMap<string, boolean>;
  /** Filled while walking: the elaboration conditions met, by their text without blanks. */
  readonly elaborationConditions?: Set<string>;
  /**
   * The source of `text` as written, same offsets: comments and strings kept. Conditions are
   * told apart by it: `MODE == "A"` and `MODE == "B"` are blanked alike.
   */
  readonly source?: string;
  /** Values no instance can change (`verilogFixedConstants`): a condition of them alone is decided. */
  readonly fixedConstants?: Bindings;
  /** Declared ranges no instance can change: a `case` selector's width, for whether its labels name every value. */
  readonly selectorRangeOf?: (name: string) => BitRange | undefined;
  /** The module's declared signals, ports included: a selector of them has a width synthesis knows. */
  readonly signals?: ReadonlySet<string>;
  /** The module's arrays of vectors: an element of one is a word, not a bit (`verilogWordArrays`). */
  readonly wordArrays?: ReadonlySet<string>;
  /** Counts the work of a walk: statements, and bits of loops followed. */
  readonly work?: { steps: number };
}

const NOTHING: ReadonlySet<string> = new Set();
/** How wide a selector may be for its values to be counted: 2^8 labels at most. */
const MAX_COUNTED_WIDTH = 8;
/** How wide a wildcard case label may be for its pattern to be built. */
const MAX_WILDCARD_LABEL_BITS = 256;
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
 * Whether `assigned` covers the target: the target, or its whole signal. A bit known only
 * while running (`q[?]`) or fixed while elaborating (`q[I]`) is also covered by every
 * declared bit of `q` (`q = d;` before `if (en) q[I] = …`). Writing such a bit leaves the
 * others as they were, so it covers no numbered bit, even on every path.
 */
function covers(ctx: StatementContext, assigned: ReadonlySet<string>, target: string): boolean {
  const signal = signalOf(target);
  // `q[?]` written on every path may be another bit on each run: it does not cover itself.
  if (assigned.has(signal) || (assigned.has(target) && !target.endsWith(UNKNOWN_BIT))) return true;
  // A bit known by number is covered only by itself; one known only while running (`q[?]`) or
  // fixed while elaborating (`q[I]`, `q[i]`) by every declared bit of its signal.
  if (target === signal || /\[-?\d+\]$/.test(target)) return false;
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
  // Every bit counts: `q[i +: 256]` over 256 runs is 65 536 of them.
  if (ctx.work) ctx.work.steps += bits.length;
  return bits;
}

const NAME = /[A-Za-z_]\w*/g;

/**
 * `q[i]` with `i` a genvar, `q[W-1:E]` with parameters of a value the check cannot work out
 * (an index of such names, constants and numbers): bits fixed before running, in each copy
 * of a `generate` loop. They are named by the index as written, so two paths that write
 * `q[i]` both cover it; they are never a run-time value.
 */
function fixedBits(ctx: StatementContext, name: string, index: string): string | undefined {
  // A based literal's letters are no names: `q[1'b0 + 1'b1]` is fixed, a constant the evaluator does not compute.
  const names = index.replace(BASED_NUMBER, ' ').match(NAME) ?? [];
  const fixed = ctx.fixedNames;
  if (fixed === undefined || index.includes('`') || !names.every((n) => fixed.has(n) || ctx.constants.has(n))) return undefined;
  if (names.length === 0 && !/'/.test(index)) return undefined;
  return `${name}[${index.replace(/\s+/g, '')}]`;
}

/**
 * `q[?]`: a bit known only while running. When the index uses a loop variable (`q[f(i)]`,
 * or loops too many to follow), the loop may well write every bit: the check is unsure.
 */
function unknownBit(ctx: StatementContext, name: string, index: string): string[] {
  const fixed = fixedBits(ctx, name, index);
  if (fixed !== undefined) return [fixed];
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
  return { end, some: assigned, every: assigned, cover: signalsOf(assigned) };
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
  return { end: j + 'end'.length, some: union(parts.map((p) => p.some)), every: union(parts.map((p) => p.every)), cover: union(parts.map((p) => p.cover)) };
}

/** A number as written, `4'hF`, `1'b0`: its letters are no names. */
const BASED_NUMBER = /\d*\s*'[sS]?[bBoOdDhH]\s*[0-9a-fA-FxXzZ?_]+/g;
/** The system functions synthesis computes while elaborating. */
const ELABORATION_FUNCTION = /^\$(?:clog2|bits|size)$/;

/**
 * A condition synthesis decides while elaborating, one way for each instance: it reads
 * only parameters, genvars, numbers and `$clog2`. Its value is not taken from the
 * parameters' defaults, since an instance may override them (`#(.R(1))`).
 */
function isElaborationCondition(ctx: StatementContext, condition: string): boolean {
  const fixed = ctx.fixedNames;
  // A macro may stand for a signal (`` if (`ON) `` with `` `define ON en ``): a run-time condition.
  if (fixed === undefined || condition.includes('`')) return false;
  const names = condition.replace(BASED_NUMBER, ' ').match(/\$?[A-Za-z_]\w*/g) ?? [];
  return names.every((name) => ELABORATION_FUNCTION.test(name) || fixed.has(name) || ctx.constants.has(name));
}

/** The largest 32-bit signed integer: an unsized decimal number above it is not a plain integer in Verilog. */
const MAX_INTEGER = 2_147_483_647;

/** `ON`, `MODE == 2`, `2 != W`: a name or a decimal number, compared for equality. */
const SIMPLE_EQUALITY = /^([A-Za-z_]\w*|\d+)\s*(===|!==|==|!=)\s*([A-Za-z_]\w*|\d+)$/;
const SINGLE_NAME = /^[A-Za-z_]\w*$/;

/**
 * The value of a condition on values no instance can change, when its meaning is plain: a
 * localparam of fixed value alone, or two of them (or a decimal number) compared with `==`
 * or `!=`, all of them non-negative so neither width nor sign can change the answer. Anything
 * else is undefined: Verilog's operator rules are not evaluated (`!2 == 1` is `(!2) == 1`).
 */
function fixedValue(condition: string, fixed: Bindings | undefined): boolean | undefined {
  if (fixed === undefined) return undefined;
  const c = unwrapped(condition);
  const valueOf = (token: string) => (/^\d+$/.test(token) ? Number(token) : valueOfName(fixed, token));
  // Non-negative and within a 32-bit integer: no width or sign rule changes a comparison of such values.
  const known = (v: number | undefined): v is number => v !== undefined && v >= 0 && v <= MAX_INTEGER;
  if (SINGLE_NAME.test(c)) {
    const v = valueOf(c);
    return known(v) ? v !== 0 : undefined;
  }
  const m = SIMPLE_EQUALITY.exec(c);
  if (!m) return undefined;
  const [a, b] = [valueOf(m[1]), valueOf(m[3])];
  if (!known(a) || !known(b)) return undefined;
  return m[2].startsWith('=') ? a === b : a !== b;
}

/** A string literal, `\"` and `\\` inside it included. */
const STRING_LITERAL = /"(?:[^"\\\n]|\\.)*"/g;

/**
 * The condition at `at` as written, its blanks dropped outside its strings: `MODE == "A"`
 * and `MODE=="A"` are one condition, `MODE == "AB"` and `MODE == "A B"` two.
 */
function conditionKey(ctx: StatementContext, condition: string, at: number): string {
  const written = ctx.source?.slice(at, at + condition.length) ?? condition;
  const strings = written.match(STRING_LITERAL) ?? [];
  const outside = written.split(STRING_LITERAL).map((part) => part.replace(/\s+/g, ''));
  return outside.map((part, k) => part + (strings[k] ?? '')).join('');
}

/** The branch an elaboration condition takes in the configuration being walked; undefined when it is not decided. */
function elaborationDecision(ctx: StatementContext, condition: string, at: number): boolean | undefined {
  if (!isElaborationCondition(ctx, condition)) return undefined;
  const fixed = fixedValue(condition, ctx.fixedConstants);
  if (fixed !== undefined) return fixed;
  const key = conditionKey(ctx, condition, at);
  ctx.elaborationConditions?.add(key);
  return ctx.decisions?.get(key);
}

/**
 * An `if` assigns what both branches assign on every path. An elaboration condition
 * decided for the configuration being walked (`keptTargets`) is the branch it picks: the
 * other is never built in that configuration, and what it leaves unsure does not count.
 */
function ifStatement(ctx: StatementContext, i: number): Assigned {
  const condition = parentheses(ctx.text, i);
  const [thenUnsure, elseUnsure] = [new Set<string>(), new Set<string>()];
  const then = statementAssigns({ ...ctx, unsure: thenUnsure }, condition.after);
  const next = skipBlanks(ctx.text, then.end);
  const hasElse = wordAt(ctx.text, next) === 'else';
  const otherwise = hasElse ? statementAssigns({ ...ctx, unsure: elseUnsure }, next + 'else'.length) : { end: then.end, some: NOTHING, every: NOTHING, cover: NOTHING };
  const decided = elaborationDecision(ctx, condition.inside, condition.after - condition.inside.length - 1);
  for (const target of decided === false ? [] : thenUnsure) ctx.unsure.add(target);
  for (const target of decided === true ? [] : elseUnsure) ctx.unsure.add(target);
  if (decided !== undefined) return { ...(decided ? then : otherwise), end: otherwise.end };
  return { end: otherwise.end, some: union([then.some, otherwise.some]), every: intersection(ctx, [then.every, otherwise.every]), cover: common([then.cover, otherwise.cover]) };
}

/** A sized number in a concatenation: `2'b01`, `4'hF`. */
const SIZED_LITERAL = /^(\d+)'[sS]?[bBoOdDhH][0-9a-fA-FxXzZ?_]+$/;

/**
 * The width of a case selector: a declared signal, one bit of it, a constant part of it,
 * or a concatenation of those and sized numbers (`{a[24], b[24]}` is two bits). An element
 * of an array of vectors (`busword[0]` of `wire [1:0] busword [0:0]`) is a word, of a width
 * not counted here.
 */
function selectorWidth(selector: string, rangeOf: StatementContext['rangeOf'], wordArrays: ReadonlySet<string>): number | undefined {
  const s = unwrapped(selector).replace(/\s+/g, '');
  if (s.startsWith('{') && closingBracket(s, 0) === s.length - 1) {
    const widths = topLevelItems(s.slice(1, -1)).map((item) => Number(SIZED_LITERAL.exec(item)?.[1]) || selectorWidth(item, rangeOf, wordArrays));
    return widths.every((w) => w !== undefined) ? widths.reduce<number>((sum, w) => sum + (w ?? 0), 0) : undefined;
  }
  const whole = /^[A-Za-z_]\w*$/.test(s) ? rangeOf(s) : undefined;
  return whole ? Math.abs(whole.msb - whole.lsb) + 1 : selectionWidth(s, wordArrays);
}

/** The width of `s[3]` (1) or `s[3:0]` (4); none for a word of an array of vectors, or any other form. */
function selectionWidth(s: string, wordArrays: ReadonlySet<string>): number | undefined {
  const selected = /^([A-Za-z_]\w*)\[/.exec(s)?.[1];
  if (selected === undefined || wordArrays.has(selected)) return undefined;
  if (/^[A-Za-z_]\w*\[\d+\]$/.test(s)) return 1;
  const part = /^[A-Za-z_]\w*\[(\d+):(\d+)\]$/.exec(s);
  return part ? Math.abs(Number(part[1]) - Number(part[2])) + 1 : undefined;
}

type CaseKind = 'case' | 'casez' | 'casex';

interface CaseSelector {
  readonly kind: CaseKind;
  readonly width?: number;
  readonly constants: Bindings;
}

/** Equal-width case operands compare their bit patterns even for a negative signed literal. */
function caseValue(label: string, { width, constants }: CaseSelector): number | undefined {
  const value = integerValue(label, constants);
  if (value === undefined || value >= 0 || width === undefined) return value;
  const size = /^(\d+)\s*'/.exec(label);
  return Number(size?.[1]) === width ? value + 2 ** width : value;
}

/** A based label with an `x`, `z` or `?` digit: `2'b1?`, `'hz`. */
const WILDCARD_DIGIT = /'[sS]?[bBoOhH]\s*[0-9a-f_xz?]*[xz?]/i;
const WILDCARD_LABEL = /^(?<size>\d*)\s*'(?<signed>s?)(?<base>[boh])\s*(?<digits>[0-9a-fxz?_]+)$/i;
const DIGIT_BASE: Readonly<Record<string, number>> = { b: 2, o: 8, h: 16 };

/** One written digit as a regex over its bits: `.` for a bit that matches anything. */
function wildcardDigit(digit: string, radix: number, kind: CaseKind): string {
  const group = Math.log2(radix);
  if ('z?'.includes(digit) || (kind === 'casex' && digit === 'x')) return '.'.repeat(group);
  const n = parseInt(digit, radix);
  // A fixed X in casez cannot match a binary selector.
  return Number.isNaN(n) ? 'x'.repeat(group) : n.toString(2).padStart(group, '0');
}

/** A label's width in bits: as written, or for an unsized one all its written bits and 32 at least. */
function labelSize(written: string, digitBits: number): number | undefined {
  const size = written ? Number(written) : Math.max(UNSIZED_LITERAL_WIDTH, digitBits);
  return size >= 1 && size <= MAX_WILDCARD_LABEL_BITS ? size : undefined;
}

/** The selector values a wildcard label matches, its written digits cut or extended to the label's size. */
function wildcardPattern(label: string, width: number, kind: CaseKind): { pattern: RegExp; size: number } | undefined {
  const m = WILDCARD_LABEL.exec(label)?.groups;
  if (!m) return undefined;
  const radix = DIGIT_BASE[m.base.toLowerCase()];
  const digits = [...m.digits.replace(/_/g, '').toLowerCase()].map((d) => wildcardDigit(d, radix, kind)).join('');
  const size = labelSize(m.size, digits.length);
  // A signed operand of a different width needs the selector's signedness to extend it.
  if (size === undefined || (m.signed && size !== width)) return undefined;
  // A leading x or z extends to the left; any other digit extends with zeros.
  const bits = digits.slice(-size).padStart(size, /^[.x]/.test(digits) ? digits[0] : '0');
  return { pattern: new RegExp('^' + bits + '$'), size };
}

/**
 * Whether the labels name every value the selector can have. When that cannot be counted
 * (a selector of unknown or great width, a wildcard label that cannot be read) a casez or
 * casex with wildcards is taken as complete, so no latch is reported that may not be one.
 */
function namesEveryValue(labels: readonly string[], selector: CaseSelector): boolean {
  const { width, kind } = selector;
  const wildcards = kind === 'case' ? [] : labels.filter((label) => WILDCARD_DIGIT.test(label));
  if (width === undefined || width > MAX_COUNTED_WIDTH) return wildcards.length > 0;
  const covered = new Set(labels.map((label) => caseValue(label.trim(), selector)));
  for (const label of wildcards) {
    const wildcard = wildcardPattern(label.trim(), width, kind);
    if (!wildcard) return true;
    for (let n = 0; n < 2 ** width; n++) {
      if (wildcard.pattern.test(n.toString(2).padStart(wildcard.size, '0'))) covered.add(n);
    }
  }
  return Array.from({ length: 2 ** width }, (_, n) => covered.has(n)).every(Boolean);
}

/** The offset of a `default` item's `:`, or of its last letter when it has none (`default q = 0;` is Verilog too). */
function defaultEnd(text: string, i: number): number {
  const after = skipBlanks(text, i + 'default'.length);
  return text[after] === ':' ? after : i + 'default'.length - 1;
}

/**
 * A `case` marked `full_case`: `case (s) // synopsys full_case` (the directive between the
 * selector and the first item, or right before `case`: Quartus takes both), or
 * `(* full_case *) case (s)` (the attribute right before it).
 */
function markedFullCase(ctx: StatementContext, caseAt: number, firstItemAt: number): boolean {
  const { directives, attributes } = ctx.fullCase ?? NO_FULL_CASE;
  // The marks are blanked: only blanks stand between one right before `case` and the `case`.
  const rightBefore = (p: number) => p >= 0 && p < caseAt && ctx.text.slice(p, caseAt).trim() === '';
  return directives.some((p) => (p >= caseAt && p < firstItemAt) || rightBefore(p)) || attributes.some(rightBefore);
}

/** The signals a selector reads, whole or in part: `s`, `s[W-1:0]`, `{a, b[1], 2'b0}`; undefined for any other form. */
function selectorSignals(selector: string): string[] | undefined {
  const s = unwrapped(selector);
  if (s.startsWith('{') && closingBracket(s, 0) === s.length - 1) {
    const parts = topLevelItems(s.slice(1, -1)).map((item) => (SIZED_LITERAL.test(item.replace(/\s+/g, '')) ? [] : selectorSignals(item)));
    return parts.some((p) => p === undefined) ? undefined : parts.flatMap((p) => p ?? []);
  }
  const m = /^([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?$/.exec(s);
  return m ? [m[1]] : undefined;
}

/**
 * Whether the labels name every value of the selector as no instance can change them: the
 * selector's width with fixed ranges (an overridden parameter may widen it), the labels with
 * fixed constants (an overridden parameter may move one: `B:` with `#(.B(2))`). A selector of
 * declared signals has a width synthesis knows even when the check cannot compute it
 * (`[W-1:0]` with `W = $clog2(4)`, or a parameter an instance overrides): the labels may name
 * only part of its values, so the wildcard fallback of `namesEveryValue` does not apply.
 */
function labelsNameEveryValue(ctx: StatementContext, written: string, labels: { readonly items: readonly string[]; readonly kind: CaseKind }): boolean {
  const selector = unwrapped(written); // `casez ((s))` reads `s`
  if (labels.items.some((label) => matchesAnyValue(label, labels.kind))) return true;
  const width = selectorWidth(selector, ctx.selectorRangeOf ?? ctx.rangeOf, ctx.wordArrays ?? NOTHING);
  if (width === undefined && ofDeclaredSignals(ctx, selector)) return false;
  return namesEveryValue(labels.items, { width, constants: ctx.fixedConstants ?? ctx.constants, kind: labels.kind });
}

/** A selector made of the module's declared signals: synthesis knows its width. */
function ofDeclaredSignals(ctx: StatementContext, selector: string): boolean {
  const signals = selectorSignals(selector);
  return signals !== undefined && signals.length > 0 && signals.every((name) => ctx.signals?.has(name) ?? false);
}

/** An unsized label of wildcard digits only, `'b?` or `'hz` in a casez (`x` too in a casex): it matches a selector of any width up to 32 bits. */
function matchesAnyValue(label: string, kind: CaseKind): boolean {
  const m = WILDCARD_LABEL.exec(label.trim())?.groups;
  if (!m || m.size !== '' || kind === 'case') return false;
  const wildcard = kind === 'casex' ? /^[?zx_]+$/i : /^[?z_]+$/i;
  return wildcard.test(m.digits);
}

function caseStatement(ctx: StatementContext, i: number): Assigned {
  const { text } = ctx;
  const selector = parentheses(text, i);
  const items: Assigned[] = [];
  const labels: string[] = [];
  let hasDefault = false;
  let j = skipBlanks(text, selector.after);
  const fullCase = markedFullCase(ctx, i, j);
  while (j < text.length && wordAt(text, j) !== 'endcase') {
    const isDefault = wordAt(text, j) === 'default';
    const labelEnd = isDefault ? defaultEnd(text, j) : caseLabelEnd(text, j);
    if (isDefault) hasDefault = true;
    else labels.push(...topLevelItems(text.slice(j, labelEnd)));
    const item = statementAssigns(ctx, labelEnd + 1);
    items.push(item);
    j = skipBlanks(text, Math.max(item.end, j + 1));
  }
  const complete = hasDefault || fullCase || labelsNameEveryValue(ctx, selector.inside, { items: labels, kind: wordAt(text, i) as CaseKind });
  return { end: j + 'endcase'.length, ...caseItems(ctx, items, complete) };
}

/** What a case's items assign together: on every path only when the case names every value. */
function caseItems(ctx: StatementContext, items: readonly Assigned[], complete: boolean): Omit<Assigned, 'end'> {
  const some = union(items.map((it) => it.some));
  if (!complete) return { some, every: NOTHING, cover: NOTHING };
  return { some, every: intersection(ctx, items.map((it) => it.every)), cover: common(items.map((it) => it.cover)) };
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
  // A loop may write what its body writes: one the check cannot run may cover its targets.
  return { end: body.end, some: body.some, every: loop?.runs ? body.every : NOTHING, cover: body.cover };
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
  if (i >= ctx.text.length) return { end: ctx.text.length, some: NOTHING, every: NOTHING, cover: NOTHING };
  if (ctx.text[i] === ';') return { end: i + 1, some: NOTHING, every: NOTHING, cover: NOTHING };
  if (ctx.work) ctx.work.steps++;
  return (STATEMENT_BY_KEYWORD.get(wordAt(ctx.text, i)) ?? simpleStatement)(ctx, i);
}

/** Where the statement at `from` ends. */
export const statementEnd = (text: string, from: number): number =>
  statementAssigns({ text, rangeOf: () => undefined, constants: new Map(), loops: new Map(), unsure: new Set() }, from).end;

/** The targets some path leaves unassigned: each may keep its value. */
export function notAlwaysAssigned(ctx: StatementContext, assigned: Assigned): string[] {
  return [...assigned.some].filter((target) => !covers(ctx, assigned.every, target));
}

/** How many elaboration conditions a block may have for every combination of them to be walked (2^6 walks). */
const MAX_ELABORATION_CONDITIONS = 6;

/**
 * How much work all the combinations of a block may take together, counted as the first
 * walk counts it (statements and loop bits) times the combinations. Past it, the first
 * walk's answer stands: each condition read as any other `if`.
 */
const MAX_COMBINATION_WORK = 20_000;

/** What an instance cannot change: the localparams of fixed value, and the ranges declared with them. */
export type FixedView = Pick<StatementContext, 'constants' | 'rangeOf'>;

/**
 * The targets some path of `assigned` leaves unassigned, but not those the check is unsure
 * of: a bit `unsure` names, or a signal of unknown width (no bits) that a loop the check
 * cannot follow writes, when every path may write it (`cover`). A path that writes nothing
 * of it keeps it whatever the loop does: `if (en) begin q = d; for (…) q[i] = …; end`.
 */
function surelyKept(ctx: StatementContext, assigned: Assigned, unsure: ReadonlySet<string>): string[] {
  const unsureSignals = new Set([...unsure].map(signalOf));
  const unsureWhole = (t: string) => t === signalOf(t) && unsureSignals.has(t) && assigned.cover.has(t);
  return notAlwaysAssigned(ctx, assigned).filter((t) => !unsure.has(t) && !unsureWhole(t));
}

/**
 * What the statement at the start of `ctx.text` assigns, and the targets some path surely
 * leaves unassigned in some configuration of the module. Each combination of its
 * elaboration conditions (`if (R == 2)`) is walked with them decided, since an instance may
 * set the parameters either way: `if (R == 2) q = d; else if (e) q = d;` keeps `q` when R
 * is not 2. A configuration is not the defaults, so it is walked with `fixed` alone: a loop
 * bound or width made of a parameter is unknown there, and what it writes unsure in that
 * configuration only. A target one configuration never assigns keeps nothing there. With
 * more conditions, or more work, than can be combined, each is read as any other `if`.
 */
export function keptTargets(ctx: StatementContext, fixed: FixedView): { assigned: Assigned; kept: string[] } {
  const [conditions, unsure, work] = [new Set<string>(), new Set<string>(), { steps: 0 }];
  const assigned = statementAssigns({ ...ctx, decisions: undefined, elaborationConditions: conditions, unsure, work }, 0);
  const keys = [...conditions];
  const combinations = 2 ** keys.length;
  if (keys.length === 0 || keys.length > MAX_ELABORATION_CONDITIONS || work.steps * combinations > MAX_COMBINATION_WORK) {
    return { assigned, kept: surelyKept(ctx, assigned, unsure) };
  }
  const kept = new Set<string>();
  const configuration = { ...ctx, ...fixed, selectorRangeOf: fixed.rangeOf, work: undefined };
  for (let n = 0; n < combinations; n++) {
    const decisions = new Map(keys.map((key, bit) => [key, (n & (1 << bit)) !== 0]));
    const unsureHere = new Set<string>();
    const walk = statementAssigns({ ...configuration, decisions, unsure: unsureHere }, 0);
    for (const target of surelyKept(configuration, walk, unsureHere)) kept.add(target);
  }
  return { assigned, kept: [...kept] };
}
