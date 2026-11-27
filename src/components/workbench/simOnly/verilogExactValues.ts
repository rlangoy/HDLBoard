// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The values of a Verilog module's constants exactly as Verilog computes them, or none
 * (docs/impl_sim_only_warnings.md § 3.4). Only what Verilog's width and sign rules cannot
 * change is computed: one literal (`2'b10`, `4'hF`), one earlier constant, or arithmetic on
 * 32-bit integers (unsized decimal numbers, integer constants and `$clog2` of them), unsigned
 * constants beside them (`W - 1` with `localparam [7:0] W = 4`, computed in 32 bits), every
 * step in range and, with an unsigned constant, none below zero. `32'hffff_ffff + 32'd1` is
 * 0 in Verilog and no value here; `$clog2(A + B)` of two 4-bit constants adds them in 4 bits,
 * and is none either. A declared `integer` type or `[msb:lsb]` range then cuts the value as
 * Verilog does (`localparam [0:0] ON = 2` is 0). Pure.
 */

import { aloneKey, clog2, integerValue, unsignedKey, type Bindings } from './constantIndex';

/**
 * A constant's value and kind: a 32-bit signed `integer`, whose arithmetic is plain while in
 * range; `unsigned`, of a width of its own (`4'hF`, `[7:0]`), plain only beside an integer
 * and above zero; `signed` of a width of its own, read only alone.
 */
interface Exact {
  readonly value: bigint;
  readonly kind: 'integer' | 'unsigned' | 'signed';
}

/** An `integer`, and an unsized decimal number, is 32 bits wide and signed. */
const INTEGER_WIDTH = 32;
const INT_MIN = -(BigInt(2) ** BigInt(INTEGER_WIDTH - 1));
const INT_MAX = BigInt(2) ** BigInt(INTEGER_WIDTH - 1) - BigInt(1);
const ZERO = BigInt(0);
const inIntegerRange = (v: bigint): boolean => v >= INT_MIN && v <= INT_MAX;

const SINGLE_NAME = /^[A-Za-z_]\w*$/;
const SINGLE_LITERAL = /^\d*\s*'([sS]?)[bBoOdDhH]\s*[0-9a-fA-F_]+$/;
const TOKEN = /\d[\d_]*|\$?[A-Za-z_]\w*|[-+*/%()]|\S/g;

/** What an expression context used: a 32-bit integer operand, an unsigned constant, a negative step. */
interface Context {
  usedInteger: boolean;
  usedUnsigned: boolean;
  negative: boolean;
}

const FRESH_CONTEXT: Readonly<Context> = { usedInteger: false, usedUnsigned: false, negative: false };

/** An unsigned constant makes the context unsigned: plain only in at least 32 bits (beside an integer) and never below zero. */
const widthSafe = (c: Context): boolean => !c.usedUnsigned || (c.usedInteger && !c.negative);

interface Reader extends Context {
  readonly tokens: readonly string[];
  at: number;
  readonly known: ReadonlyMap<string, Exact>;
}

const OPERATION: Readonly<Record<string, (a: bigint, b: bigint) => bigint | undefined>> = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  // BigInt division truncates toward zero, and the remainder takes the dividend's sign, as in Verilog.
  '/': (a, b) => (b === ZERO ? undefined : a / b),
  '%': (a, b) => (b === ZERO ? undefined : a % b),
};

/** A step's result, `undefined` when it left the 32-bit range; a negative one is noted in the context. */
function inRange(r: Reader, next: bigint | undefined): bigint | undefined {
  if (next === undefined || !inIntegerRange(next)) return undefined;
  if (next < ZERO) r.negative = true;
  return next;
}

/** Terms joined by the operators of one level; undefined as soon as a step leaves the 32-bit range. */
function chain(r: Reader, operators: string, operand: (r: Reader) => bigint | undefined): bigint | undefined {
  let value = operand(r);
  while (value !== undefined && operators.includes(r.tokens[r.at] ?? '#')) {
    const operator = r.tokens[r.at++];
    const right = operand(r);
    value = inRange(r, right === undefined ? undefined : OPERATION[operator](value, right));
  }
  return value;
}

const sum = (r: Reader): bigint | undefined => chain(r, '+-', product);
const product = (r: Reader): bigint | undefined => chain(r, '*/%', factor);

/** `( … )` after its opening parenthesis: the value inside, and the closing one read. */
function parenthesized(r: Reader): bigint | undefined {
  const value = sum(r);
  return r.tokens[r.at++] === ')' ? value : undefined;
}

/** `$clog2( … )` after its name: its argument a context of its own, as wide as its operands alone; its result an integer. */
function clog2Call(r: Reader): bigint | undefined {
  if (r.tokens[r.at++] !== '(') return undefined;
  const inner: Reader = { ...r, ...FRESH_CONTEXT };
  const value = parenthesized(inner);
  r.at = inner.at;
  const bits = value === undefined || !widthSafe(inner) ? undefined : clog2(Number(value));
  if (bits === undefined) return undefined;
  r.usedInteger = true;
  return BigInt(bits);
}

/** The factors that start with a token of their own: a negation, parentheses, `$clog2( … )`. */
const FACTOR_FORMS: ReadonlyMap<string, (r: Reader) => bigint | undefined> = new Map([
  ['-', (r: Reader) => {
    const value = factor(r);
    if (value === undefined || !inIntegerRange(-value)) return undefined;
    if (-value < ZERO) r.negative = true;
    return -value;
  }],
  ['(', parenthesized],
  ['$clog2', clog2Call],
]);

/** An unsized decimal number, a 32-bit signed integer; undefined when it does not fit. */
function decimal(r: Reader, token: string): bigint | undefined {
  const value = BigInt(token.replace(/_/g, ''));
  r.usedInteger = true;
  return value <= INT_MAX ? value : undefined;
}

/**
 * A constant in arithmetic: an integer, or an unsigned one (the context notes which); a signed
 * one of its own width is none. A negative value is noted too: beside an unsigned constant
 * Verilog reads it unsigned (`N % W` with `N = -3` and `W` 8-bit unsigned is 1, not 0).
 */
function named(r: Reader, token: string): bigint | undefined {
  const constant = r.known.get(token);
  if (constant?.kind === 'integer') r.usedInteger = true;
  else if (constant?.kind === 'unsigned') r.usedUnsigned = true;
  else return undefined;
  if (constant.value < ZERO) r.negative = true;
  return constant.value;
}

function factor(r: Reader): bigint | undefined {
  const token = r.tokens[r.at++];
  if (token === undefined) return undefined;
  const form = FACTOR_FORMS.get(token);
  if (form) return form(r);
  return /^\d/.test(token) ? decimal(r, token) : named(r, token);
}

/** One based literal (`4'hF`, `'b1`, `4'sd3`): unsigned unless written signed. */
function literalExact(literal: string, signed: boolean): Exact | undefined {
  const value = integerValue(literal, new Map());
  return value === undefined ? undefined : { value: BigInt(value), kind: signed ? 'signed' : 'unsigned' };
}

/** An arithmetic expression, a context of its own: unsigned when an unsigned constant is in it, else an integer. */
function arithmeticExact(text: string, known: ReadonlyMap<string, Exact>): Exact | undefined {
  const tokens = text.match(TOKEN) ?? [];
  const reader: Reader = { tokens, at: 0, known, ...FRESH_CONTEXT };
  const value = sum(reader);
  if (value === undefined || reader.at !== tokens.length || !widthSafe(reader)) return undefined;
  return { value, kind: reader.usedUnsigned ? 'unsigned' : 'integer' };
}

/** The value of a constant's expression, before any declared type cuts it. */
function expressionValue(text: string, known: ReadonlyMap<string, Exact>): Exact | undefined {
  const t = text.trim();
  if (SINGLE_NAME.test(t)) return known.get(t);
  const literal = SINGLE_LITERAL.exec(t);
  return literal ? literalExact(t, literal[1] !== '') : arithmeticExact(t, known);
}

const RANGE_TYPE = /^(signed|unsigned)?\s*\[\s*(\d+)\s*:\s*(\d+)\s*\]$/;
/**
 * The widest declared range a value is cut to here. A value is at most a safe integer, so a
 * wider range cuts nothing but a negative value, which no fixed constant keeps; a range of
 * absurd width (`[99999999999999999:0]`, invalid HDL being edited) is not computed at all.
 */
const MAX_TYPED_WIDTH = 64;

/** The value as a constant of the declared type has it: `integer` is 32-bit signed, `[1:0]` two bits, unsigned unless `signed`. */
function withType(exact: Exact, type: string): Exact | undefined {
  const t = type.trim().replace(/\s+/g, ' ');
  if (t === '') return exact;
  if (t === 'integer') return { value: BigInt.asIntN(INTEGER_WIDTH, exact.value), kind: 'integer' };
  const range = RANGE_TYPE.exec(t);
  if (!range) return undefined;
  const width = Math.abs(Number(range[2]) - Number(range[3])) + 1;
  if (!Number.isSafeInteger(width) || width < 1 || width > MAX_TYPED_WIDTH) return undefined;
  return range[1] === 'signed'
    ? { value: BigInt.asIntN(width, exact.value), kind: 'signed' }
    : { value: BigInt.asUintN(width, exact.value), kind: 'unsigned' };
}

const KEY_OF: Readonly<Record<Exact['kind'], (name: string) => string>> = { integer: (name) => name, unsigned: unsignedKey, signed: aloneKey };

/**
 * The exact values of `items`, in declaration order (a later one may use an earlier one); the
 * others are absent. Each is kept under the key of its kind (`constantIndex.ts`): an integer
 * under its name, an unsigned constant for arithmetic beside an integer, a signed one alone.
 */
export function exactValues(items: readonly { name: string; value: string; type: string }[]): Bindings {
  const known = new Map<string, Exact>();
  for (const { name, value, type } of items) {
    if (known.has(name)) continue;
    const computed = expressionValue(value, known);
    const typed = computed && withType(computed, type);
    if (typed && Number.isSafeInteger(Number(typed.value))) known.set(name, typed);
  }
  return new Map([...known].map(([name, exact]) => [KEY_OF[exact.kind](name), Number(exact.value)]));
}
