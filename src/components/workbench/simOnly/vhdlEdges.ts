// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The words of a VHDL clock edge both VHDL checks read (docs/impl_sim_only_warnings.md
 * § 3.3, § 3.4): `clk'event`, and the level test beside it that gives it a direction
 * (`clk'event and clk = '1'`). Read from the synthesis view of the code, which keeps
 * `'0'` and `'1'`. Pure.
 */

import { topLevel, unwrapped } from './brackets';
import { escapeRegExp } from './constructText';
import { tidy, type EdgeDirection } from './registerShared';

type Level = '0' | '1';

const OTHER_LEVEL: Readonly<Record<Level, Level>> = { '0': '1', '1': '0' };

/** The edge that ends at a level: the clock is `'1'` just after its rising edge. */
const EDGE_ENDING_AT: Readonly<Record<Level, EdgeDirection>> = { '1': 'rising', '0': 'falling' };

/** A whole operand that is `clk'event`, the signal in group 1. */
export const EVENT_OPERAND = /^([A-Za-z]\w*(?:\.\w+)*(?:\s*\([^()]*\))?)\s*'\s*event$/i;

/** The operands of a condition's `and`s, those of a parenthesized `and` included: `(a and b) and c` is a, b, c. */
export function conjuncts(condition: string): string[] {
  const top = topLevel(condition);
  const cuts = [...top.matchAll(/\band\b/gi)].map((m) => m.index ?? 0);
  const starts = [0, ...cuts.map((c) => c + 'and'.length)];
  const operands = starts.map((s, i) => unwrapped(condition.slice(s, cuts[i] ?? condition.length)));
  return operands.length === 1 ? operands : operands.flatMap(conjuncts);
}

/** The level an operand compares `signal` with, in either order: `clk = '1'` and `clk /= '0'` both say `'1'`. */
function levelIn(signal: string, operand: string): Level | undefined {
  const name = escapeRegExp(tidy(signal));
  const comparison = new RegExp(`^(?:${name}(/?=)'([01])'|'([01])'(/?=)${name})$`, 'i').exec(tidy(operand));
  if (!comparison) return undefined;
  const [, signalFirstOperator, signalFirstLevel, levelFirstLevel, levelFirstOperator] = comparison;
  const level = (signalFirstLevel ?? levelFirstLevel) as Level;
  const isNotEqual = (signalFirstOperator ?? levelFirstOperator) === '/=';
  return isNotEqual ? OTHER_LEVEL[level] : level;
}

/**
 * The edge a `signal'event` in this condition means: the level of `signal` its `and`s
 * test beside it (`clk'event and clk = '1'` is the rising edge). Undefined when none
 * does: `clk'event` alone takes both edges.
 */
export function eventDirectionOf(signal: string, condition: string): EdgeDirection | undefined {
  const level = conjuncts(unwrapped(condition)).map((operand) => levelIn(signal, operand)).find((l) => l !== undefined);
  return level === undefined ? undefined : EDGE_ENDING_AT[level];
}

/** A comparison of the event signal with a fixed level, in either operand order. */
export function testsLevelOf(signal: string, text: string): boolean {
  return eventDirectionOf(signal, text) !== undefined;
}
