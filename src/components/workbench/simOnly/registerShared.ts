// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * What the register checks of both languages share (docs/impl_sim_only_warnings.md
 * § 3.4): names as each language compares them, the signals a register template
 * assigns with their bits, and the one rule both check — two clocks on one register.
 * Pure.
 */

import type { UnitText } from '../tbDetect/rules';
import type { CodeBlock, Language } from '../tbDetect/types';
import { overlap, type Bits } from './bits';
import type { Found } from './constructs';
import type { RegisterProblem, RegisterProblemKind } from './types';
import { blockText } from './constructText';
import { isHidden } from './scan';

/** A name as written, without blanks: `KEY_N (1)` is `KEY_N(1)`. */
export const tidy = (name: string): string => name.replace(/\s+/g, '');

/**
 * The register problems that build, though not as the template: synthesis emulates the
 * register with latches (Quartus Warning 13004), which start up undefined but run as
 * simulated. They are shown, `quiet`, and keep the design on the board.
 */
const BUILT_FROM_LATCHES: ReadonlySet<RegisterProblemKind> = new Set(['set-and-reset', 'async-load']);

/** A register problem at a line, with the tier its kind has. */
export const registerFound = (line: number, register: RegisterProblem): Found =>
  BUILT_FROM_LATCHES.has(register.kind) ? { line, register, tier: 'quiet' } : { line, register };

/**
 * How a value lines up with its target, bit by bit: `aligned` when each bit of it comes
 * from the same position of each operand (a copy, or only bitwise operators: `~q[3:1]`,
 * `a & q[2:0]`), `mixed` when an operator mixes positions (`+`, a reduction, a
 * concatenation).
 */
export type BitAlignment = 'aligned' | 'mixed';

/**
 * Whether one read of a register in a value feeds back into the bits written: the whole
 * signal or the same bits; or constant bits that overlap, where a mixed value
 * (`q[3:0] <= q[2:0] + 1`) reads them all, and an aligned one only when a bit lands on
 * itself. A shifted copy or bitwise chain (`q[2:0] <= ~q[3:1]`) has no bit reading itself.
 * Indexes known only while running and written differently do not feed back here.
 */
export function feedsBack(read: SelectedBits, written: SelectedBits, alignment: BitAlignment): boolean {
  if (read.text === '' || written.text === '' || read.text === written.text) return true;
  const [r, w] = [read.bits, written.bits];
  if (r.kind !== 'range' || w.kind !== 'range' || !overlap(r, w)) return false;
  return alignment === 'mixed' || r.low === w.low;
}

/** A select as written (`[3:0]`, `(2 downto 0)`, or empty for the whole signal), and its bits. */
export interface SelectedBits {
  readonly text: string;
  readonly bits: Bits;
}

/** Names as the language compares them: VHDL ignores case, Verilog does not (`q` and `Q` are two). */
export type SameName = (a: string, b: string) => boolean;
export const SAME_NAME: Readonly<Record<Language, SameName>> = {
  vhdl: (a, b) => a.toLowerCase() === b.toLowerCase(),
  verilog: (a, b) => a === b,
};

/** Each name once, the first spelling kept. */
export const unique = (names: readonly string[], same: SameName): string[] =>
  names.filter((name, i) => names.findIndex((other) => same(other, name)) === i);

/** A signal a register template assigns, with the bits: `LEDR(0)` and `LEDR(1)` are two registers. */
export interface Target {
  readonly name: string;
  readonly bits: Bits;
}

/** The targets two `if`s or blocks have in common: the same signal, and bits that can be the same. */
const sharedTargets = (a: readonly Target[], b: readonly Target[], same: SameName): string[] =>
  unique(b.filter((y) => a.some((x) => same(x.name, y.name) && overlap(x.bits, y.bits))).map((t) => t.name), same);

/** A register template of the code — an `if` with an edge, an edge-triggered block — with its clock and targets. */
export interface Clocked<T> {
  readonly part: T;
  readonly clock: string;
  /** The direction of the edge, when the code says it (`clk'event` alone does not). */
  readonly edge?: EdgeDirection;
  readonly targets: readonly Target[];
}

export type EdgeDirection = 'rising' | 'falling';

/** A later template on another clock than an earlier one, or the other edge of the same one, and the registers they both assign. */
export interface TwoClocks<T> {
  readonly later: T;
  readonly kind: 'two-clocks' | 'both-edges';
  /** The two clocks; for `both-edges`, the one clock. */
  readonly clocks: readonly string[];
  readonly registers: readonly string[];
}

/**
 * Templates on two clocks that assign one register (Quartus Error 10820 in VHDL,
 * 10028 in Verilog), or on the rising and the falling edge of one clock (10819): each is
 * a register template, but the register has two clock edges. Reported on the later one.
 */
export function twoClocks<T>(parts: readonly Clocked<T>[], same: SameName): TwoClocks<T>[] {
  return parts.flatMap((later, i): TwoClocks<T>[] => {
    for (const earlier of parts.slice(0, i)) {
      const kind = clockClash(earlier, later, same);
      const registers = kind === undefined ? [] : sharedTargets(earlier.targets, later.targets, same);
      if (kind === undefined || registers.length === 0) continue;
      const clocks = kind === 'two-clocks' ? [earlier.clock, later.clock] : [later.clock];
      return [{ later: later.part, kind, clocks, registers }];
    }
    return [];
  });
}

/** How two templates' edges clash: another clock, the other edge of the same clock, or not at all. */
function clockClash<T>(a: Clocked<T>, b: Clocked<T>, same: SameName): TwoClocks<T>['kind'] | undefined {
  if (!same(a.clock, b.clock)) return 'two-clocks';
  return a.edge !== undefined && b.edge !== undefined && a.edge !== b.edge ? 'both-edges' : undefined;
}

/**
 * A block's code as synthesis reads it: lines inside translate_off blanked (newlines
 * kept, so offsets and lines stay). A debug write there takes part in no check.
 */
export function synthesizedBlockText(t: UnitText, block: CodeBlock): string {
  const text = blockText(t, block);
  if (t.simOnlyRegions.length === 0) return text;
  let out = '';
  let lineStart = 0;
  for (const line of text.split('\n')) {
    out += isHidden(t.lineOf(block.from + lineStart), t.simOnlyRegions) ? line.replace(/[^\n]/g, ' ') : line;
    out += '\n';
    lineStart += line.length + 1;
  }
  return out.slice(0, -1);
}
