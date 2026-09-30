// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { Language } from './fileKinds';
import { tokenizeVerilog } from './verilogHighlight';
import { tokenizeVhdlLine, type Token } from './vhdlHighlight';

/**
 * The tokens of every line of a file, by the file's language. Verilog has its own
 * tokenizer; everything else — VHDL, and a name of no known language — takes the VHDL
 * one, line by line, exactly as the editor always has.
 */
export function tokenizeSource(language: Language | undefined, lines: readonly string[]): Token[][] {
  return language === 'verilog' ? tokenizeVerilog(lines) : lines.map(tokenizeVhdlLine);
}
