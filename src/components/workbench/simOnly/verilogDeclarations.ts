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

/** Each parameter and localparam of the module, as written: its name and its value's text. */
function parameterItems(code: string): { name: string; value: string }[] {
  return [...code.matchAll(PARAMETER)].flatMap((m) =>
    topLevelItems(parameterList(code, (m.index ?? 0) + m[0].length)).flatMap((item) => {
      const parameter = PARAMETER_ITEM.exec(item);
      return parameter ? [{ name: parameter[1], value: parameter[2] }] : [];
    }),
  );
}

/** The module's parameters and localparams with a value made of numbers and earlier ones: `N = 8`, `W = N * 2`. */
export function verilogConstants(code: string): Bindings {
  const constants = new Map<string, number>();
  for (const { name, value } of parameterItems(code)) {
    const known = integerValue(value, constants);
    if (known !== undefined && !constants.has(name)) constants.set(name, known);
  }
  return constants;
}

const INTEGER = /\b(?:integer|genvar)\b([^;]*)/g;
const GENVAR = /\bgenvar\b([^;]*)/g;

/**
 * The names fixed when synthesis elaborates the module, whether or not the check knows
 * their value: its genvars (`genvar i, j;`, `for (genvar k = 0; …)`) and its parameters
 * and localparams.
 */
export function verilogElaborationNames(code: string): ReadonlySet<string> {
  const genvars = [...code.matchAll(GENVAR)].flatMap((m) => m[1].split(',').map((item) => /^\s*([A-Za-z_]\w*)/.exec(item)?.[1]));
  const parameters = parameterItems(code).map((p) => p.name);
  return new Set([...genvars, ...parameters].filter((name): name is string => name !== undefined));
}

/** The signals the module declares, ports included: what a value reads when it is no constant. */
export function verilogSignalNames(code: string): ReadonlySet<string> {
  const declared = [...code.matchAll(DECLARATION)].flatMap((m) => declaredNames(m[3]).map((d) => d.name));
  const integers = [...code.matchAll(INTEGER)].flatMap((m) => declaredNames(m[1]).map((d) => d.name));
  return new Set([...declared, ...integers]);
}

/** A declaration: its kind words, an optional range, and its names (with any initial values) up to the next declaration word. */
const DECLARATION = /\b(?:input|output|inout|reg|wire|logic)\b((?:\s+(?:reg|wire|logic|signed|unsigned))*)\s*(?:\[([^\]]*)\])?((?:(?!\b(?:input|output|inout|reg|wire|logic)\b)[^;()])*)/g;
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
    const packed = m[2] === undefined ? undefined : rangeOf(m[2], constants);
    for (const { name, unpacked } of declaredNames(m[3])) {
      const range = bitsOfDeclared({ scalar: m[2] === undefined, packed }, unpacked, constants);
      if (range && !ranges.has(name)) ranges.set(name, range);
    }
  }
  return (name) => ranges.get(name);
}

/**
 * The bits a declared name has: its packed range, or a scalar's bit 0. An array of single
 * bits (`reg q [7:-1]`) is indexed by its one unpacked range; an array of words
 * (`reg [7:0] ram [0:63]`) is indexed by word, so it has no bits here.
 */
function bitsOfDeclared({ scalar, packed }: { scalar: boolean; packed?: BitRange }, unpacked: string | undefined, constants: Bindings): BitRange | undefined {
  if (unpacked === undefined) return scalar ? { msb: 0, lsb: 0 } : packed;
  return scalar ? rangeOf(unpacked, constants) : undefined;
}

/** The names of one declaration, each with its unpacked range if it has one: `input a, b` declares both; `input a, input [1:0] b` starts another at `input`. */
function declaredNames(list: string): { name: string; unpacked?: string }[] {
  const names: { name: string; unpacked?: string }[] = [];
  for (const item of topLevelItems(list)) {
    // `q`, `q [7:0]` (an array of bits), `q = 4'd0` (with an initial value).
    const m = /^\s*([A-Za-z_]\w*)\s*(?:\[([^\]]*)\]\s*)?(?:=[\s\S]*)?$/.exec(item);
    if (!m || DECLARATION_WORD.test(m[1])) break;
    names.push({ name: m[1], unpacked: m[2] });
  }
  return names;
}
