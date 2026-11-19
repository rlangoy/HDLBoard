// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Indexes and loop bounds a Verilog check can work out before running: whole numbers,
 * the variables of the loops around (`7 - i`, `2*i + 1`), `+ - * / %` and parentheses.
 * Anything else (a signal, a parameter, a function) is not known. Pure.
 */

/** The values of the loop variables in scope at one point. */
export type Bindings = ReadonlyMap<string, number>;

/** The value of `expression`, or undefined when it holds anything not known. */
export function integerValue(expression: string, bindings: Bindings): number | undefined {
  const tokens = expression.match(/\d+|[A-Za-z_]\w*|[-+*/%()]|\S/g) ?? [];
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
  if (/^\d+$/.test(token)) return Number(token);
  return r.bindings.get(token);
}

/** Every combination of the values of the loops around: `i` 0..3 and `j` 0..1 is eight. */
export function everyBinding(loops: ReadonlyMap<string, readonly number[]>): Bindings[] {
  return [...loops].reduce<Bindings[]>(
    (combinations, [name, values]) => combinations.flatMap((b) => values.map((v) => new Map([...b, [name, v]]))),
    [new Map()],
  );
}
