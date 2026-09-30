// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The word lists behind the Icarus advice of
 * docs/editor_diagnostics_verilog_research.md § 3. Pure data. The reserved words
 * are the highlighter's, which are Icarus's own 1364-2005 table (pinned by a test
 * in verilogHighlight.test.ts), so the advice and the compiler agree.
 * Verilog is case-sensitive: every lookup here is exact.
 */

import { VERILOG_KEYWORDS, VERILOG_TYPES } from './verilogHighlight';

/** Every reserved word Icarus knows at its default generation (1364-2005). */
export const VERILOG_RESERVED_WORDS: ReadonlySet<string> = new Set([...VERILOG_KEYWORDS, ...VERILOG_TYPES]);

/**
 * Reserved only for library configurations (IEEE 1364-2005 § 13). Never
 * suggested, as PSL's words are not for VHDL: a beginner who typed `desing` did
 * not mean the `design` of a config block.
 */
export const CONFIG_WORDS: ReadonlySet<string> = new Set([
  'cell', 'config', 'design', 'endconfig', 'incdir', 'include', 'instance', 'liblist', 'library', 'use',
]);

/**
 * SystemVerilog words a student may bring from another course. Icarus compiles
 * without -g2012, so they are plain names to it; they are never "corrected" to a
 * Verilog keyword either, since the student did not misspell them.
 */
export const SYSTEMVERILOG_WORDS: ReadonlySet<string> = new Set([
  'logic', 'bit', 'byte', 'int', 'shortint', 'longint', 'always_ff', 'always_comb', 'always_latch',
  'enum', 'typedef', 'struct', 'union', 'unique', 'priority', 'final', 'import', 'package', 'interface',
]);

/** The reserved words a misspelling may be corrected to. */
export const SUGGESTED_VERILOG_KEYWORDS: readonly string[] = [...VERILOG_RESERVED_WORDS].filter(
  (word) => !CONFIG_WORDS.has(word),
);

/**
 * Keywords written as one word, or borrowed from another language, and what
 * Verilog wants instead (research § 3, Rule E). An `if` block in Verilog ends
 * with the `end` of its `begin`, so `endif` is `end`.
 */
export const VERILOG_JOINED_KEYWORDS: ReadonlyMap<string, string> = new Map([
  ['endif', 'end'],
  ['elseif', 'else if'],
  ['elsif', 'else if'],
  ['endalways', 'end'],
  ['endbegin', 'end'],
]);

export function isVerilogReservedWord(word: string): boolean {
  return VERILOG_RESERVED_WORDS.has(word);
}
