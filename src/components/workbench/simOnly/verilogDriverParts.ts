// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Which bits a Verilog assignment drives with a value, and which with 'Z', when that can
 * be worked out before running (docs/impl_sim_only_warnings.md § 8.1): `q <= {1'bz, d}`
 * drives `q[1]` with 'Z' and `q[0]` with `d`; `{a, b} <= {2'bzz, c}` sets `a` and `b`
 * apart. Both sides are lined up bit by bit, so every width must be known: numbers with a
 * size, declared signals, constant selects, nested concatenations and replications.
 * Read from blanked code. Pure.
 */

import { bitRange, type Bits } from './bits';
import { MAX_WIRING_BITS, wiringCycles, type SourceBit, type TargetBit } from './bitWiring';
import { bracketed, topLevel, topLevelItems, unwrapped } from './brackets';
import { integerValue, type Bindings } from './constantIndex';
import type { BitRange } from './verilogDeclarations';

/** A target and the bits of it one part of the assignment drives. */
export interface DrivenPart {
  readonly target: string;
  readonly bits: Bits;
  readonly tristate: boolean;
}

/** What the parser knows of the module. */
export interface Declarations {
  readonly rangeOf: (name: string) => BitRange | undefined;
  readonly constants: Bindings;
}

const LITERAL = /^(\d+)\s*'[sS]?([bBoOhHdD])\s*([0-9a-fA-FxXzZ?_]+)$/;
const DIGIT_BITS: Readonly<Record<string, number>> = { b: 1, o: 3, h: 4 };
const NAME_SELECT = /^([A-Za-z_]\w*)\s*(?:\[([^\]]*)\])?$/;

/** The bits a name or a constant select of it names, msb first. */
function selectedBits(text: string, d: Declarations): { name: string; bits: number[] } | undefined {
  const m = NAME_SELECT.exec(text.trim());
  if (!m) return undefined;
  const [, name, index] = m;
  const range = index === undefined ? d.rangeOf(name) : selectRange(index, d.constants);
  if (!range || Math.abs(range.msb - range.lsb) + 1 > MAX_WIRING_BITS) return undefined;
  const step = range.msb >= range.lsb ? -1 : 1;
  const bits = Array.from({ length: Math.abs(range.msb - range.lsb) + 1 }, (_, k) => range.msb + step * k);
  return { name, bits };
}

function selectRange(index: string, constants: Bindings): BitRange | undefined {
  const [msbText, lsbText, ...more] = topLevelItems(index, ':');
  if (more.length > 0) return undefined;
  const msb = integerValue(msbText, constants);
  const lsb = lsbText === undefined ? msb : integerValue(lsbText, constants);
  return msb === undefined || lsb === undefined ? undefined : { msb, lsb };
}

/** The target bits of a left-hand side, msb first: `q`, `q[3:0]`, `{a, b[1:0]}`. */
function targetBits(lhs: string, d: Declarations): TargetBit[] | undefined {
  const items = concatenationItems(lhs) ?? [lhs];
  const bits: TargetBit[] = [];
  for (const item of items) {
    const selected = selectedBits(item, d);
    if (!selected || bits.length + selected.bits.length > MAX_WIRING_BITS) return undefined;
    bits.push(...selected.bits.map((bit) => ({ target: selected.name, bit })));
  }
  return bits;
}

/** The items of `{a, b}` when the text is one concatenation, else undefined. */
function concatenationItems(text: string): string[] | undefined {
  const t = unwrapped(text);
  return t.startsWith('{') && bracketed(t, 0).length === t.length - 2 ? topLevelItems(bracketed(t, 0)) : undefined;
}

/** Each source bit in positional order, including named wires and high-impedance literals. */
function valueBits(value: string, d: Declarations): SourceBit[] | undefined {
  const t = unwrapped(value);
  const replication = /^\{\s*([^,{}]+?)\s*\{([\s\S]*)\}\s*\}$/.exec(t);
  if (replication) return replicated(replication[1], `{${replication[2]}}`, d);
  const items = concatenationItems(t);
  if (items) return joined(items, d);
  const literal = LITERAL.exec(t);
  if (literal) return literalBits(literal);
  const selected = selectedBits(t, d);
  return selected?.bits.map((bit) => ({ target: selected.name, bit }));
}

function replicated(count: string, inner: string, d: Declarations): SourceBit[] | undefined {
  const n = integerValue(count, d.constants);
  const one = valueBits(inner, d);
  if (!Number.isSafeInteger(n) || n === undefined || n <= 0 || !one?.length || n * one.length > MAX_WIRING_BITS) return undefined;
  return Array.from({ length: n }, () => one).flat();
}

function joined(items: string[], d: Declarations): SourceBit[] | undefined {
  const bits: SourceBit[] = [];
  for (const item of items) {
    const part = valueBits(item, d);
    if (!part || bits.length + part.length > MAX_WIRING_BITS) return undefined;
    bits.push(...part);
  }
  return bits;
}

/** `4'b10zz` bit by bit, `8'hzF` four bits a digit, `2'dz` all 'Z' or none; padded to its size with its top digit's kind. */
function literalBits([, size, base, digits]: RegExpExecArray): boolean[] | undefined {
  const width = Number(size);
  if (width < 1 || width > MAX_WIRING_BITS) return undefined;
  const clean = digits.replace(/_/g, '');
  const per = DIGIT_BITS[base.toLowerCase()];
  const isZ = (ch: string) => /[zZ?]/.test(ch);
  const written = per === undefined ? Array.from({ length: width }, () => isZ(clean[0])) : [...clean].flatMap((ch) => Array.from({ length: per }, () => isZ(ch)));
  const padding = Array.from({ length: Math.max(0, width - written.length) }, () => isZ(clean[0]));
  return [...padding, ...written].slice(-width);
}

/**
 * The parts `lhs <= rhs` drives, each a run of bits of one target that is all value or all
 * 'Z'; undefined when the widths are not all known or do not match.
 */
export function drivenParts(lhs: string, rhs: string, d: Declarations): DrivenPart[] | undefined {
  const targets = targetBits(lhs, d);
  const values = valueBits(rhs.replace(/^\s*#\s*(?:\([^)]*\)|[\w.]+)/, ''), d);
  if (!targets || !values || targets.length !== values.length) return undefined;
  return runs(targets, values.map((bit) => bit === true)).map((r) => ({ target: r.target, tristate: r.tristate, bits: bitRange(r.from, r.to) }));
}

/** A concatenation is unsigned. Verilog truncates or zero-extends it at the left. */
export function concatenationCycles(lhs: string, rhs: string, d: Declarations): string[] | undefined {
  if (!unwrapped(rhs).startsWith('{')) return undefined;
  const sources = valueBits(rhs, d);
  const targets = targetBits(lhs, d);
  if (!sources || !targets?.length) return undefined;
  const padding = Array<SourceBit>(Math.max(0, targets.length - sources.length)).fill(false);
  return wiringCycles(targets, [...padding, ...sources.slice(-targets.length)]);
}

/** Neighbouring bits of one target that are all value or all 'Z', as runs. */
function runs(targets: readonly TargetBit[], values: readonly boolean[]): { target: string; tristate: boolean; from: number; to: number }[] {
  const found: { target: string; tristate: boolean; from: number; to: number }[] = [];
  targets.forEach(({ target, bit }, k) => {
    const last = found[found.length - 1];
    if (last && last.target === target && last.tristate === values[k] && Math.abs(bit - last.to) === 1) last.to = bit;
    else found.push({ target, tristate: values[k], from: bit, to: bit });
  });
  return found;
}

/** The text of a statement split at its top-level `<=` or `=`: what is assigned, and the value. */
export function splitAssignment(statement: string): { lhs: string; rhs: string } | undefined {
  const top = topLevel(statement);
  const at = top.search(/<?=(?!=)/);
  if (at < 0) return undefined;
  const operator = top[at] === '<' ? 2 : 1;
  return { lhs: statement.slice(0, at), rhs: statement.slice(at + operator) };
}
