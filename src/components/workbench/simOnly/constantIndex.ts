// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Indexes and loop bounds a Verilog check can work out before running: whole numbers
 * (`10`, `8'd10`, `4'hF`), the module's constants and the variables of the loops around
 * (`7 - i`, `2*i + 1`, `N - 1`), `+ - * / %` and parentheses. Anything else (a signal, a
 * function, `x` or `z` digits) is not known. Pure.
 */

/** The values of the names in scope at one point: constants and loop variables. */
export type Bindings = ReadonlyMap<string, number>;

const TOKEN = /\d*\s*'[sS]?[bBoOdDhH]\s*[0-9a-fA-F_]+|\d+|[A-Za-z_]\w*|[-+*/%()]|\S/g;
/** `8'd10`, `4'hF`, `'b1010`: digits only. */
const BASED = /^(?<size>\d*)\s*'(?<signed>s?)(?<base>[bodh])\s*(?<digits>[0-9a-f_]+)$/i;
/** An unsized based literal (`'hF`) has at least this many bits. */
export const UNSIZED_LITERAL_WIDTH = 32;
const VALID_DIGITS: Readonly<Record<string, RegExp>> = { b: /^[01]+$/, o: /^[0-7]+$/, d: /^\d+$/, h: /^[0-9a-f]+$/i };
const PREFIX: Readonly<Record<string, string>> = { b: '0b', o: '0o', d: '', h: '0x' };

/** The value of `expression`, or undefined when it holds anything not known. */
export function integerValue(expression: string, bindings: Bindings): number | undefined {
  const tokens = expression.match(TOKEN) ?? [];
  const reader = { tokens, at: 0, bindings };
  const value = sum(reader);
  return value !== undefined && reader.at === tokens.length ? value : undefined;
}

interface Reader {
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

/** Terms joined by the operators of one level, left to right. */
function chain(r: Reader, operators: string, operand: (r: Reader) => number | undefined): number | undefined {
  let value = operand(r);
  while (value !== undefined && operators.includes(r.tokens[r.at] ?? '#')) {
    const operator = r.tokens[r.at++];
    const right = operand(r);
    value = right === undefined ? undefined : OPERATION[operator](value, right);
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

function factor(r: Reader): number | undefined {
  const token = r.tokens[r.at++];
  if (token === undefined) return undefined;
  if (token === '-') {
    const value = factor(r);
    return value === undefined ? undefined : -value;
  }
  if (token === '(') {
    const value = sum(r);
    return r.tokens[r.at++] === ')' ? value : undefined;
  }
  return literalValue(token) ?? r.bindings.get(token);
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
