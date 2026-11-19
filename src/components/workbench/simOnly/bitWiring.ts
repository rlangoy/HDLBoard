// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** Largest vector whose individual connections the live check follows. */
export const MAX_WIRING_BITS = 1024;

export interface TargetBit {
  readonly target: string;
  readonly bit: number;
}

/** A named source bit or a literal bit (the boolean records high impedance for the driver check). */
export type SourceBit = TargetBit | boolean;

const keyOf = (b: TargetBit): string => `${b.target}[${b.bit}]`;

/** Both lists are in HDL positional order. Follow each wire until it leaves the
 * assignment, reaches a previously checked bit, or returns to a bit on this path. */
export function wiringCycles(targets: readonly TargetBit[], sources: readonly SourceBit[]): string[] | undefined {
  if (targets.length !== sources.length) return undefined;
  const next = new Map<string, TargetBit>();
  const seenTargets = new Set<string>();
  for (const [i, bit] of targets.entries()) {
    const key = keyOf(bit);
    if (seenTargets.has(key)) return undefined;
    seenTargets.add(key);
    const source = sources[i];
    if (typeof source !== 'boolean') next.set(key, source);
  }
  const cycles = new Set<string>();
  for (const start of next.keys()) {
    const path = new Map<string, TargetBit>();
    let key = start;
    for (let source = next.get(key); source; source = next.get(key)) {
      path.set(key, source);
      next.delete(key);
      key = keyOf(source);
    }
    for (let source = path.get(key); source; source = path.get(key)) {
      cycles.add(source.target);
      path.delete(key);
      key = keyOf(source);
    }
  }
  return [...cycles];
}
