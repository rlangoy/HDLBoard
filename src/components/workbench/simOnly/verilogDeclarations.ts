// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * What a Verilog module declares that the checks can work out before running
 * (docs/impl_sim_only_warnings.md § 3.4, § 8.1): the values of its parameters and
 * localparams, and the bit ranges of its ports and variables (`[N-1:0]` included, when
 * `N` is known). Read from blanked code. Pure.
 */

import { topLevelItems } from './brackets';
import { integerValue, type Bindings } from './constantIndex';

/** A declared range: `[7:0]` is msb 7, lsb 0; a scalar is 0, 0. */
export interface BitRange {
  readonly msb: number;
  readonly lsb: number;
}

const PARAMETER = /\b(?:parameter|localparam)\b/g;
const PARAMETER_ITEM = /^\s*(?:(?:parameter|localparam)\s+)?(?:(?:integer|signed|unsigned)\s+)?(?:\[[^\]]*\]\s*)?([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/;

/** The text after a `parameter` keyword up to its `;`, or the `)` that closes a `#( … )` list. */
function parameterList(code: string, from: number): string {
  let depth = 0;
  for (let i = from; i < code.length; i++) {
    if ('([{'.includes(code[i])) depth++;
    else if (')]}'.includes(code[i])) {
      if (depth === 0) return code.slice(from, i);
      depth--;
    } else if (code[i] === ';' && depth === 0) return code.slice(from, i);
  }
  return code.slice(from);
}

/** The module's parameters and localparams with a value made of numbers and earlier ones: `N = 8`, `W = N * 2`. */
export function verilogConstants(code: string): Bindings {
  const constants = new Map<string, number>();
  for (const m of code.matchAll(PARAMETER)) {
    for (const item of topLevelItems(parameterList(code, (m.index ?? 0) + m[0].length))) {
      const parameter = PARAMETER_ITEM.exec(item);
      const value = parameter ? integerValue(parameter[2], constants) : undefined;
      if (parameter && value !== undefined && !constants.has(parameter[1])) constants.set(parameter[1], value);
    }
  }
  return constants;
}

/** A declaration: its kind words, an optional range, and its names up to the next declaration word. */
const DECLARATION = /\b(?:input|output|inout|reg|wire|logic)\b((?:\s+(?:reg|wire|logic|signed|unsigned))*)\s*(?:\[([^\]]*)\])?((?:(?!\b(?:input|output|inout|reg|wire|logic)\b)[^;=()])*)/g;
const DECLARATION_WORD = /^(?:input|output|inout|reg|wire|logic|signed|unsigned)$/;

/** `7:0`, `N-1:0` with `N` known; undefined for anything else. */
function rangeOf(range: string, constants: Bindings): BitRange | undefined {
  const [msb, lsb, ...more] = topLevelItems(range, ':');
  if (lsb === undefined || more.length > 0) return undefined;
  const [high, low] = [integerValue(msb, constants), integerValue(lsb, constants)];
  return high === undefined || low === undefined ? undefined : { msb: high, lsb: low };
}

/** The ranges the module declares (`input sel` is bit 0, `input [N-1:0] sel` bits N-1 to 0), first declaration first. */
export function declaredRanges(code: string, constants: Bindings = verilogConstants(code)): (name: string) => BitRange | undefined {
  const ranges = new Map<string, BitRange>();
  for (const m of code.matchAll(DECLARATION)) {
    const range = m[2] === undefined ? { msb: 0, lsb: 0 } : rangeOf(m[2], constants);
    if (!range) continue;
    for (const name of declaredNames(m[3])) if (!ranges.has(name)) ranges.set(name, range);
  }
  return (name) => ranges.get(name);
}

/** The names of one declaration: `input a, b` declares both; `input a, input [1:0] b` starts another at `input`. */
function declaredNames(list: string): string[] {
  const names: string[] = [];
  for (const item of list.split(',')) {
    const name = /^\s*([A-Za-z_]\w*)/.exec(item)?.[1];
    if (name === undefined || DECLARATION_WORD.test(name)) break;
    names.push(name);
  }
  return names;
}
