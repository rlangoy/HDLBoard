// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Keeping the console's memory bounded (docs/Verilog_implementation_plan.md § 5.5). A
 * design that prints for hours would otherwise grow the list, and the DOM with it,
 * without limit; the newest lines are the ones worth reading. Pure.
 */

export const MAX_CONSOLE_LINES = 2000;

/** `lines` with `line` added, oldest lines dropped so that at most `max` remain. */
export function appendCapped<T>(lines: readonly T[], line: T, max: number = MAX_CONSOLE_LINES): T[] {
  const next = [...lines, line];
  return next.length > max ? next.slice(next.length - max) : next;
}
