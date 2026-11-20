// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { VhdlDeclarations, type DeclaredRange, type ObjectType } from '../vhdlDeclarations';
import { MAX_WIRING_BITS, wiringCycles, type SourceBit, type TargetBit } from './bitWiring';
import { topLevelItems, unwrapped } from './brackets';

type Bounds = { left: number; right: number };
export type BoundsOf = (name: string) => Bounds | undefined;

function objectBounds(type?: ObjectType): Bounds | undefined {
  if (type?.kind === 'scalar' && /^(?:std_u?logic|bit)$/i.test(type.name)) return { left: 0, right: 0 };
  return type?.kind === 'vector' ? vectorBounds(type.range) : undefined;
}

function vectorBounds(range?: DeclaredRange): Bounds | undefined {
  if (range?.left === undefined || range.right === undefined) return undefined;
  const bounds = { left: range.left, right: range.right };
  return nullRange(range.direction, bounds) ? undefined : bounds;
}

function nullRange(direction: string | undefined, { left, right }: Bounds): boolean {
  return direction === 'to' ? left > right : direction === 'downto' && left < right;
}

/** Resolve whole-vector assignments lazily, in the scope of the process. */
export function vhdlWiringBounds(code: string): (line: number) => BoundsOf {
  let declarations: VhdlDeclarations | undefined;
  return (line) => (name) => {
    declarations ??= new VhdlDeclarations(code.split('\n'));
    return objectBounds(declarations.typeAt(name, line));
  };
}

const SELECT = /^([a-z]\w*)(?:\(\s*(-?\d+)(?:\s+(downto|to)\s+(-?\d+))?\s*\))?$/i;

function bitsOf(operand: string, boundsOf: BoundsOf): TargetBit[] | undefined {
  const match = SELECT.exec(operand.toLowerCase().replace(/\s+\(/g, '('));
  if (!match) return undefined;
  const [, target, first, direction, last] = match;
  const bounds = first === undefined ? boundsOf(target) : { left: Number(first), right: Number(last ?? first) };
  if (!bounds) return undefined;
  const { left, right } = bounds;
  const width = Math.abs(right - left) + 1;
  if (!Number.isSafeInteger(width) || width > MAX_WIRING_BITS || nullRange(direction, bounds)) return undefined;
  return Array.from({ length: width }, (_, i) => ({ target, bit: left + i * Math.sign(right - left) }));
}

/** A `'0'` or `'1'` is one bit; other literals are blanked by the lexer. Infer their widths
 * only when there is a unique split of the remaining bits (VHDL requires an exact width match). */
function alignParts(items: string[], width: number, boundsOf: BoundsOf): SourceBit[] | undefined {
  const parts: (SourceBit[] | undefined)[] = [];
  let remaining = width;
  let blanks = 0;
  for (const item of items) {
    if (/^'[01]'$/.test(item.trim())) {
      if (!remaining) return undefined;
      parts.push([false]);
      remaining--;
      continue;
    }
    if (item === '') {
      blanks++;
      parts.push(undefined);
      continue;
    }
    const bits = bitsOf(item, boundsOf);
    if (!bits || bits.length > remaining) return undefined;
    remaining -= bits.length;
    parts.push(bits);
  }
  if (blanks > 1) return undefined;
  return parts.flatMap<SourceBit>((p) => p ?? Array<boolean>(remaining).fill(false));
}

export function vhdlConcatFeedback(lhs: string, value: string, boundsOf: BoundsOf): boolean | undefined {
  if (!value.includes('&')) return undefined;
  const items = topLevelItems(unwrapped(value), '&').map(unwrapped);
  if (items.length < 2) return undefined;
  const targets = bitsOf(lhs, boundsOf);
  if (!targets?.length) return undefined;
  const sources = alignParts(items, targets.length, boundsOf);
  const cycles = sources && wiringCycles(targets, sources);
  return cycles && cycles.length > 0;
}
