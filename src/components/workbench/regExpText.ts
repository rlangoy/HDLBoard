// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Text put into a regular expression as itself. A name can hold any character – a
 * Verilog escaped identifier such as `\cnt(3) `, a generate scope such as
 * `genblk1[0]` – and it must neither throw nor match other text. Pure.
 */
export function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
