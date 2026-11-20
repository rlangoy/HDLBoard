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
import { tidy } from './registerShared';

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

/** A comparison of the event signal with a fixed level, in either operand order. */
export function testsLevelOf(signal: string, text: string): boolean {
  const name = escapeRegExp(tidy(signal));
  const fixed = new RegExp(`^(?:${name}/?='[01]'|'[01]'/?=${name})$`, 'i');
  return conjuncts(unwrapped(text)).some((operand) => fixed.test(tidy(operand)));
}
