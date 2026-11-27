// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Verilog `if` conditions that synthesis decides before running: they test only numbers
 * and the module's constants (`if (DWIDTH_RATIO == 2)`). Synthesis keeps the branch the
 * condition picks and drops the other, so what the other assigns is never built
 * (docs/impl_sim_only_warnings.md § 3.4). Comparisons, `!`, `&&`, `||` and parentheses
 * of `constantIndex.ts` values; anything else is not known. Pure.
 */

import { topLevel, unwrapped } from './brackets';
import { integerValue, type Bindings } from './constantIndex';

/** Where `operator` stands at the top level of `text` (outside brackets), left to right. */
function topLevelSplit(text: string, operator: string): string[] {
  const top = topLevel(text);
  const parts: string[] = [];
  let from = 0;
  for (let i = top.indexOf(operator); i >= 0; i = top.indexOf(operator, i + operator.length)) {
    parts.push(text.slice(from, i));
    from = i + operator.length;
  }
  return [...parts, text.slice(from)];
}

/** `===` and `!==` compare as `==` and `!=` here: a constant has no `x` or `z` bits. */
const COMPARISON = /===|!==|==|!=|<=|>=|(?<![<>])<(?![<=])|(?<![<>=!])>(?![>=])/;
const COMPARE: Readonly<Record<string, (a: number, b: number) => boolean>> = {
  '==': (a, b) => a === b,
  '===': (a, b) => a === b,
  '!=': (a, b) => a !== b,
  '!==': (a, b) => a !== b,
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
};

function comparison(text: string, constants: Bindings): boolean | undefined {
  const m = COMPARISON.exec(topLevel(text));
  if (!m) {
    const value = integerValue(text, constants);
    return value === undefined ? undefined : value !== 0;
  }
  const [left, right] = [integerValue(text.slice(0, m.index), constants), integerValue(text.slice(m.index + m[0].length), constants)];
  return left === undefined || right === undefined ? undefined : COMPARE[m[0]](left, right);
}

/** Every part known and true, or one known false. */
function all(parts: readonly string[], constants: Bindings, stop: boolean): boolean | undefined {
  const values = parts.map((p) => constantCondition(p, constants));
  if (values.includes(stop)) return stop;
  return values.every((v) => v === !stop) ? !stop : undefined;
}

/** The value of an `if` condition made only of numbers and constants; undefined when a signal (or anything else) decides it. */
export function constantCondition(condition: string, constants: Bindings): boolean | undefined {
  const c = unwrapped(condition);
  const or = topLevelSplit(c, '||');
  if (or.length > 1) return all(or, constants, true);
  const and = topLevelSplit(c, '&&');
  if (and.length > 1) return all(and, constants, false);
  if (/^![^=]/.test(c)) {
    const value = constantCondition(c.slice(1), constants);
    return value === undefined ? undefined : !value;
  }
  return comparison(c, constants);
}
