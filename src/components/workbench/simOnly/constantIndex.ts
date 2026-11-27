// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Indexes and loop bounds a Verilog check can work out before running: whole numbers
 * (`10`, `8'd10`, `4'hF`), the module's constants and the variables of the loops around
 * (`7 - i`, `2*i + 1`, `N - 1`), `+ - * / %`, parentheses and `$clog2`. Anything else (a signal, a
 * function, `x` or `z` digits, arithmetic Verilog's widths could change) is not known. Pure.
 */

/** The values of the names in scope at one point: constants and loop variables. */
export type Bindings = ReadonlyMap<string, number>;

/**
 * Where `Bindings` keep a constant with a width or sign of its own, whose arithmetic Verilog's
 * rules could change. An unsigned one (`localparam A = 4'hF`, `localparam [7:0] W = 4`) takes
 * part in arithmetic only beside a 32-bit integer operand, every step non-negative (`W - 1`
 * is computed in 32 bits: 3; `A + B` of two 4-bit values wraps in 4 bits, so is not). A
 * signed one (`localparam signed [3:0] S = -2`) is read only as a whole expression (`q[S]`,
 * a case label `S:`).
 */
const UNSIGNED = '\u0000unsigned:';
const ALONE = '\u0000alone:';
export const unsignedKey = (name: string): string => UNSIGNED + name;
export const aloneKey = (name: string): string => ALONE + name;

/** A name's value as a whole expression: an integer constant or loop variable, or a constant of a width or sign of its own. */
export const valueOfName = (bindings: Bindings, name: string): number | undefined =>
  bindings.get(name) ?? bindings.get(UNSIGNED + name) ?? bindings.get(ALONE + name);

const TOKEN = /\d*\s*'[sS]?[bBoOdDhH]\s*[0-9a-fA-F_]+|\d+|\$?[A-Za-z_]\w*|[-+*/%()]|\S/g;
/** `8'd10`, `4'hF`, `'b1010`: digits only. */
const BASED = /^(?<size>\d*)\s*'(?<signed>s?)(?<base>[bodh])\s*(?<digits>[0-9a-f_]+)$/i;
/** An unsized based literal (`'hF`) has at least this many bits. */
export const UNSIZED_LITERAL_WIDTH = 32;
const VALID_DIGITS: Readonly<Record<string, RegExp>> = { b: /^[01]+$/, o: /^[0-7]+$/, d: /^\d+$/, h: /^[0-9a-f]+$/i };
const PREFIX: Readonly<Record<string, string>> = { b: '0b', o: '0o', d: '', h: '0x' };

/**
 * The value of `expression`, or undefined when it holds anything not known. Arithmetic is
 * computed only where Verilog's width and sign rules cannot change it: on unsized decimal
 * numbers, integer names and unsigned constants beside them (see `UNSIGNED`), every step
 * within a 32-bit integer. With a based literal in it (`$clog2(32'hffff_ffff + 32'd1)`: the
 * sum wraps to 0 in 32 bits) it is not computed; a based literal alone is.
 */
export function integerValue(expression: string, bindings: Bindings): number | undefined {
  const tokens = expression.match(TOKEN) ?? [];
  if (tokens.length === 1 && /^[A-Za-z_]/.test(tokens[0])) return valueOfName(bindings, tokens[0]);
  if (tokens.length > 1 && tokens.some((token) => token.includes("'"))) return undefined;
  return arithmeticValue(tokens, bindings);
}

/** The value of the tokens as one arithmetic expression, a context of its own. */
function arithmeticValue(tokens: readonly string[], bindings: Bindings): number | undefined {
  const reader: Reader = { tokens, at: 0, bindings, ...FRESH_CONTEXT };
  const value = sum(reader);
  return value !== undefined && reader.at === tokens.length && widthSafe(reader) ? value : undefined;
}

/** What an expression context used: a 32-bit integer operand, an unsigned constant, a negative step. */
interface Context {
  usedInteger: boolean;
  usedUnsigned: boolean;
  negative: boolean;
}

const FRESH_CONTEXT: Readonly<Context> = { usedInteger: false, usedUnsigned: false, negative: false };

/**
 * An unsigned constant makes the whole context unsigned: its arithmetic is plain only in at
 * least 32 bits (beside an integer operand) and with no step below zero.
 */
const widthSafe = (c: Context): boolean => !c.usedUnsigned || (c.usedInteger && !c.negative);

interface Reader extends Context {
  readonly tokens: readonly string[];
  at: number;
  readonly bindings: Bindings;
}

const OPERATION: Readonly<Record<string, (a: number, b: number) => number | undefined>> = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => (b === 0 ? undefined : Math.trunc(a / b)),
  '%': (a, b) => (b === 0 ? undefined : a % b),
};

/** A 32-bit integer's range: an arithmetic step that leaves it would wrap in Verilog. */
const INTEGER_MIN = -2_147_483_648;
const INTEGER_MAX = 2_147_483_647;
const inIntegerRange = (v: number | undefined): v is number => v !== undefined && v >= INTEGER_MIN && v <= INTEGER_MAX;

/** Terms joined by the operators of one level, left to right; undefined when a step leaves the 32-bit range. */
function chain(r: Reader, operators: string, operand: (r: Reader) => number | undefined): number | undefined {
  let value = operand(r);
  while (value !== undefined && operators.includes(r.tokens[r.at] ?? '#')) {
    const operator = r.tokens[r.at++];
    const right = operand(r);
    const next = right === undefined ? undefined : OPERATION[operator](value, right);
    value = inIntegerRange(next) ? next : undefined;
    if (value !== undefined && value < 0) r.negative = true;
  }
  return value;
}

const sum = (r: Reader) => chain(r, '+-', product);
const product = (r: Reader) => chain(r, '*/%', factor);

/** A number as written: `10`, `8'd10`, `4'hF`. */
function literalValue(token: string): number | undefined {
  if (/^\d+$/.test(token)) return Number(token);
  const based = BASED.exec(token)?.groups;
  if (!based) return undefined;
  const digits = based.digits.replace(/_/g, '');
  const base = based.base.toLowerCase();
  if (!VALID_DIGITS[base].test(digits)) return undefined;
  return sizedValue(BigInt(PREFIX[base] + digits), based.size, based.signed !== '');
}

/** `raw` cut or extended to the literal's width, read as signed or unsigned; undefined when that is no safe integer. */
function sizedValue(raw: bigint, size: string, signed: boolean): number | undefined {
  const width = size ? Number(size) : Math.max(UNSIZED_LITERAL_WIDTH, raw.toString(2).length);
  if (!Number.isSafeInteger(width) || width < 1) return undefined;
  const value = Number(signed ? BigInt.asIntN(width, raw) : BigInt.asUintN(width, raw));
  return Number.isSafeInteger(value) ? value : undefined;
}

/** `( … )` after its opening parenthesis: the value inside, and the closing one read. */
function parenthesized(r: Reader): number | undefined {
  const value = sum(r);
  return r.tokens[r.at++] === ')' ? value : undefined;
}

/**
 * `$clog2( … )` after its name. Its argument is a context of its own, as wide as its operands
 * alone (`$clog2(A + B)` adds two 4-bit values in 4 bits); its result is an integer.
 */
function clog2Call(r: Reader): number | undefined {
  if (r.tokens[r.at++] !== '(') return undefined;
  const inner: Reader = { ...r, ...FRESH_CONTEXT };
  const value = parenthesized(inner);
  r.at = inner.at;
  if (value === undefined || !widthSafe(inner)) return undefined;
  r.usedInteger = true;
  return clog2(value);
}

/** The factors that start with a token of their own: a negation, parentheses, `$clog2( … )`. */
const FACTOR_FORMS: ReadonlyMap<string, (r: Reader) => number | undefined> = new Map([
  ['-', (r: Reader) => {
    const value = factor(r);
    if (value !== undefined && -value < 0) r.negative = true;
    return value === undefined ? undefined : -value;
  }],
  ['(', parenthesized],
  ['$clog2', clog2Call],
]);

/**
 * A name's value in arithmetic: an integer, or an unsigned constant (the context notes which);
 * a signed one is none. A negative integer is noted too: beside an unsigned constant Verilog
 * reads it unsigned (`N % W` with `N = -3` and `W` 8-bit unsigned is 1, not 0).
 */
function nameValue(r: Reader, name: string): number | undefined {
  const integer = r.bindings.get(name);
  if (integer !== undefined) {
    r.usedInteger = true;
    if (integer < 0) r.negative = true;
    return integer;
  }
  const unsigned = r.bindings.get(UNSIGNED + name);
  if (unsigned !== undefined) r.usedUnsigned = true;
  return unsigned;
}

function factor(r: Reader): number | undefined {
  const token = r.tokens[r.at++];
  if (token === undefined) return undefined;
  const form = FACTOR_FORMS.get(token);
  if (form) return form(r);
  if (/^\d+$/.test(token)) {
    r.usedInteger = true; // an unsized decimal number is a 32-bit integer
    return Number(token);
  }
  return literalValue(token) ?? nameValue(r, token);
}

/** `$clog2(n)`: the bits that count n values, `$clog2(4)` is 2, `$clog2(5)` 3, `$clog2(0)` and `$clog2(1)` 0. Undefined for a negative n. */
export function clog2(n: number): number | undefined {
  if (n < 0 || !Number.isSafeInteger(n)) return undefined;
  let bits = 0;
  while (2 ** bits < n) bits++;
  return bits;
}

/**
 * Every combination of the values of the loops around (`i` 0..3 and `j` 0..1 is eight),
 * each with `constants` too; undefined when there are more than `most`, before any is built.
 */
export function everyBinding(loops: ReadonlyMap<string, readonly number[]>, constants: Bindings, most: number): Bindings[] | undefined {
  const count = [...loops.values()].reduce((n, values) => n * values.length, 1);
  if (count > most) return undefined;
  return [...loops].reduce<Bindings[]>(
    (combinations, [name, values]) => combinations.flatMap((b) => values.map((v) => new Map([...b, [name, v]]))),
    [new Map(constants)],
  );
}
