// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** `text` in backticks: CodeText shows it in code font. One place, so every message marks code alike. */
export function code(text: string): string {
  return `\`${text}\``;
}
