// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * What a Verilog module declares that the checks can work out before running
 * (docs/impl_sim_only_warnings.md § 3.4, § 8.1): the values of its parameters and
 * localparams, and the bit ranges of its ports and variables (`[N-1:0]` included, when
 * `N` is known). Read from blanked code. Pure.
 */

import { bracketed, topLevelItems } from './brackets';
import { integerValue, type Bindings } from './constantIndex';
import { exactValues } from './verilogExactValues';

/** A declared range: `[7:0]` is msb 7, lsb 0; a scalar is 0, 0. */
export interface BitRange {
  readonly msb: number;
  readonly lsb: number;
}

const PARAMETER = /\b(?:parameter|localparam)\b/g;
/** `[keyword] [type] name = value`; a range may hold one level of brackets (`[BITS[0]:0]`). */
const PARAMETER_ITEM = /^\s*(?:(parameter|localparam)\s+)?((?:(?:integer|signed|unsigned)\s+)?(?:\[(?:[^[\]]|\[[^\]]*\])*\]\s*)?)([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/;
/** The type of a declaration whose first item cannot be read: its other items are not computed either. */
const UNREAD_TYPE = '?';

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

interface ParameterItem {
  readonly name: string;
  /** Its value's text. */
  readonly value: string;
  /** No instance can override it. */
  readonly local: boolean;
  /** Its declared type or range, as written (`[0:0]`, `integer`); empty when none. */
  readonly type: string;
  /** Where its name is declared in the code: one declaration read through two keyword lists is one. */
  readonly at: number;
}

/** `module m #(`: where the module's parameter port list opens. */
const PARAMETER_PORT_LIST = /\bmodule\s+[A-Za-z_]\w*\s*#\s*\(/;

/** The module's parameter port list `#( … )`, when it declares any. */
function parameterPortList(code: string): { readonly from: number; readonly to: number } | undefined {
  const m = PARAMETER_PORT_LIST.exec(code);
  if (!m) return undefined;
  const open = m.index + m[0].length - 1;
  const inside = bracketed(code, open);
  return inside.includes('=') ? { from: open, to: open + inside.length + 1 } : undefined;
}

/**
 * Each parameter and localparam of the module, as written. An item without its own
 * keyword belongs to the declaration before it, type and range included
 * (`localparam [0:0] FIRST = 0, ON = 2;` declares both one bit wide). A `parameter` in the
 * body of a module with a parameter port list is local (Verilog-2005 § 12.2; Quartus
 * Warning 10222, and Errors 10213 and 10130 for `#(.B(2))` and `defparam`).
 */
function parameterItems(code: string): ParameterItem[] {
  const header = parameterPortList(code);
  return [...code.matchAll(PARAMETER)].flatMap((m) => {
    const at = m.index ?? 0;
    const inHeader = header !== undefined && at >= header.from && at < header.to;
    let declaration = { keyword: m[0], type: '' };
    let itemAt = at + m[0].length;
    return topLevelItems(parameterList(code, itemAt)).flatMap((item, k) => {
      const start = itemAt;
      itemAt += item.length + 1; // the item and its comma
      const parameter = PARAMETER_ITEM.exec(item);
      if (!parameter) {
        // Its type is not read, so neither are those of the items after it.
        if (k === 0) declaration = { keyword: m[0], type: UNREAD_TYPE };
        return [];
      }
      if (parameter[1] !== undefined || k === 0) declaration = { keyword: parameter[1] ?? m[0], type: parameter[2].trim() };
      const local = declaration.keyword === 'localparam' || (header !== undefined && !inHeader);
      const nameAt = start + item.search(new RegExp(`\\b${parameter[3]}\\s*=`));
      return [{ name: parameter[3], value: parameter[4], local, type: declaration.type, at: nameAt }];
    });
  });
}

/**
 * The module's parameters and localparams with a value made of numbers and earlier ones:
 * `N = 8`, `W = N * 2`, exactly as Verilog computes them (`verilogExactValues.ts`). A
 * parameter has its default value, which an instance may override.
 */
export function verilogConstants(code: string): Bindings {
  return exactValues(unambiguous(parameterItems(code), code));
}

/**
 * Each declaration once (one read through two keyword lists is one), and none of a name
 * declared twice: two `generate` blocks may each declare their own `ON`, and the
 * module-wide value would be the wrong one in the other block.
 */
function unambiguous(items: readonly ParameterItem[], code: string): ParameterItem[] {
  const declarations = [...new Map(items.map((item) => [item.at, item])).values()];
  const declared = new Map<string, number>();
  for (const { name } of declarations) declared.set(name, (declared.get(name) ?? 0) + 1);
  const variables = variableNames(code);
  return declarations.filter((item) => declared.get(item.name) === 1 && !variables.has(item.name));
}

/** `integer` declaring variables, not the type of a `parameter integer N`. */
const VARIABLE_INTEGER = /(?<!\b(?:parameter|localparam)\s+)\b(?:integer|time|realtime|real)\b([^;]*)/g;

/**
 * The names the module declares as variables or nets, anywhere: a named block's `reg ON`
 * shadows a module's `localparam ON` there, so a name in both is read as no constant.
 */
function variableNames(code: string): ReadonlySet<string> {
  const declared = [...code.matchAll(DECLARATION)].flatMap((m) => declaredNames(m[3]).map((d) => d.name));
  const integers = [...code.matchAll(VARIABLE_INTEGER)].flatMap((m) => declaredNames(m[1]).map((d) => d.name));
  return new Set([...declared, ...integers]);
}

/**
 * The constants no instance can change, with their value exactly as Verilog computes it
 * (`verilogExactValues.ts`): the module's local ones, and its parameters too when nothing
 * in the project overrides them (`parametersFixed`). Made of numbers and earlier such
 * constants (`localparam W = 8 * 2`, not `localparam W = N * 2` with `N` an overridable
 * parameter). One Verilog's width rules could change (`32'hffff_ffff + 32'd1`) has none,
 * and so has a name declared twice (two `generate` blocks may each declare their own
 * `ON`): the module-wide value would be the wrong one in the other block.
 */
export function verilogFixedConstants(code: string, parametersFixed = false): Bindings {
  return exactValues(unambiguous(parameterItems(code), code).filter((item) => item.local || parametersFixed));
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
  // A name a block also declares as a variable (`reg i` beside `genvar i`) may be the variable there.
  const variables = variableNames(code);
  return new Set([...genvars, ...parameters].filter((name): name is string => name !== undefined && !variables.has(name)));
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
/** The module's arrays of vectors (`wire [1:0] busword [0:3]`): `busword[0]` is a word of them, not a bit. */
export function verilogWordArrays(code: string): ReadonlySet<string> {
  return new Set([...code.matchAll(DECLARATION)].flatMap((m) => (m[2] === undefined ? [] : declaredNames(m[3]).filter((d) => d.unpacked !== undefined).map((d) => d.name))));
}

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
