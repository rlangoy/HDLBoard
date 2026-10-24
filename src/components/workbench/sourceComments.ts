// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Source text without its comments, for the light scans that look for a unit or an
 * assignment by pattern: a `module counter_tb` in a comment is not a module. Strings
 * are left as they are; the scans do not look inside them. Pure.
 */

import type { Language } from './fileKinds';

const COMMENTS: Readonly<Record<Language, RegExp>> = {
  vhdl: /--[^\n]*/g,
  verilog: /\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
};

export function withoutComments(text: string, language: Language): string {
  return text.replace(COMMENTS[language], '');
}
