// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Source text without its comments, for the light scans that look for a unit or an
 * assignment by pattern: a `module counter_tb` in a comment is not a module. Line
 * comments (`--`, `//`) and `/* … *\/` block comments go – VHDL-2008 has block comments
 * too, which the editor's line-by-line VHDL highlighter does not track – but never
 * inside a string, so `$display("/* start")` hides nothing. Each comment becomes a
 * space, and its line breaks stay, so the text keeps its lines. Pure.
 */

import type { Language } from './fileKinds';

const LINE_COMMENT: Readonly<Record<Language, string>> = { vhdl: '--', verilog: '//' };
const BLOCK_OPEN = '/*';
const BLOCK_CLOSE = '*/';
const QUOTE = '"';
const TICK = "'";

/** The index just after the comment that starts at `at`, or undefined when none starts there. */
function commentEnd(text: string, at: number, language: Language): number | undefined {
  if (text.startsWith(LINE_COMMENT[language], at)) {
    const lineEnd = text.indexOf('\n', at);
    return lineEnd === -1 ? text.length : lineEnd;
  }
  if (!text.startsWith(BLOCK_OPEN, at)) return undefined;
  const close = text.indexOf(BLOCK_CLOSE, at + BLOCK_OPEN.length);
  return close === -1 ? text.length : close + BLOCK_CLOSE.length;
}

/** A VHDL character literal is three characters: `'"'`. */
const CHARACTER_LITERAL_LENGTH = 3;

/** Whether the string's text at `i` is an escape that takes two characters: `\"` in Verilog, `""` in VHDL. */
function isEscape(text: string, i: number, language: Language): boolean {
  return language === 'verilog' ? text[i] === '\\' : text[i] === QUOTE && text[i + 1] === QUOTE;
}

/** The index just after the string that opens at `at`; a string ends at its line at the latest. */
function stringEnd(text: string, at: number, language: Language): number {
  for (let i = at + 1; i < text.length; i++) {
    if (text[i] === '\n') return i;
    if (isEscape(text, i, language)) i++;
    else if (text[i] === QUOTE) return i + 1;
  }
  return text.length;
}

/** The index after the code at `at`: a whole string, a VHDL character literal such as `'"'`, or one character. */
function codeEnd(text: string, at: number, language: Language): number {
  if (text[at] === QUOTE) return stringEnd(text, at, language);
  const characterLiteral = language === 'vhdl' && text[at] === TICK && text[at + 2] === TICK;
  return characterLiteral ? at + CHARACTER_LITERAL_LENGTH : at + 1;
}

/** A comment as what replaces it: a space, and the line breaks it spanned. */
const blanked = (comment: string) => ` ${comment.replace(/[^\n]+/g, '')}`;

export function withoutComments(text: string, language: Language): string {
  const kept: string[] = [];
  let from = 0;
  let at = 0;
  while (at < text.length) {
    const end = commentEnd(text, at, language);
    if (end === undefined) {
      at = codeEnd(text, at, language);
      continue;
    }
    kept.push(text.slice(from, at), blanked(text.slice(at, end)));
    from = at = end;
  }
  kept.push(text.slice(from));
  return kept.join('');
}
