// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The words of a VHDL clock edge both VHDL checks read (docs/impl_sim_only_warnings.md
 * § 3.3, § 3.4): `clk'event`, and the level test beside it that gives it a direction
 * (`clk'event and clk = '1'`). Read from blanked code. Pure.
 */

import { escapeRegExp } from './constructText';
import { tidy } from './registerShared';

/** A whole operand that is `clk'event`, the signal in group 1. */
export const EVENT_OPERAND = /^([A-Za-z]\w*(?:\.\w+)*(?:\s*\([^()]*\))?)\s*'\s*event$/i;

/** Whether `text` tests the level of the signal (`clk = '1'`, `clk /= '0'`; the literal is blanked): what gives `clk'event` its direction. */
export function testsLevelOf(signal: string, text: string): boolean {
  const name = escapeRegExp(tidy(signal));
  return new RegExp(`(?<![\\w.])${name}\\s*/?=(?!>)`, 'i').test(text.replace(/\s+(?=\()/g, ''));
}
