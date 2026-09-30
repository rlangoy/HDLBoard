// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The word lists behind the advice of docs/editor_diagnostics_improvement_plan.md
 * § 4.4–4.7. Pure data. Deliberately not the highlighter's `KEYWORDS`
 * (vhdlHighlight.ts), which colours `rising_edge` and leaves out `range`.
 */

/** Every reserved word of VHDL-2008 (IEEE 1076-2008 § 15.10), PSL words included. */
export const RESERVED_WORDS: ReadonlySet<string> = new Set([
  'abs', 'access', 'after', 'alias', 'all', 'and', 'architecture', 'array', 'assert',
  'assume', 'assume_guarantee', 'attribute', 'begin', 'block', 'body', 'buffer', 'bus',
  'case', 'component', 'configuration', 'constant', 'context', 'cover', 'default',
  'disconnect', 'downto', 'else', 'elsif', 'end', 'entity', 'exit', 'fairness', 'file',
  'for', 'force', 'function', 'generate', 'generic', 'group', 'guarded', 'if', 'impure',
  'in', 'inertial', 'inout', 'is', 'label', 'library', 'linkage', 'literal', 'loop', 'map',
  'mod', 'nand', 'new', 'next', 'nor', 'not', 'null', 'of', 'on', 'open', 'or', 'others',
  'out', 'package', 'parameter', 'port', 'postponed', 'procedure', 'process', 'property',
  'protected', 'pure', 'range', 'record', 'register', 'reject', 'release', 'rem', 'report',
  'restrict', 'restrict_guarantee', 'return', 'rol', 'ror', 'select', 'sequence',
  'severity', 'shared', 'signal', 'sla', 'sll', 'sra', 'srl', 'strong', 'subtype', 'then',
  'to', 'transport', 'type', 'unaffected', 'units', 'until', 'use', 'variable', 'vmode',
  'vprop', 'vunit', 'wait', 'when', 'while', 'with', 'xnor', 'xor',
]);

/**
 * Reserved only for PSL. Never suggested: a beginner who typed `propery` meant
 * `process` far more often than `property`, and `strong` is one edit from `string`.
 */
export const PSL_WORDS: ReadonlySet<string> = new Set([
  'assume', 'assume_guarantee', 'cover', 'default', 'fairness', 'property', 'restrict',
  'restrict_guarantee', 'sequence', 'strong', 'vmode', 'vprop', 'vunit',
]);

/** The reserved words a misspelling may be corrected to. */
export const SUGGESTED_KEYWORDS: readonly string[] = [...RESERVED_WORDS].filter((word) => !PSL_WORDS.has(word));

/**
 * Names from the standard libraries a beginner uses. Never "corrected" to a
 * keyword (`signed` is one edit from `signal`), and offered as suggestions for an
 * undeclared name (`std_logc` → `std_logic`).
 */
export const LIBRARY_NAMES: readonly string[] = [
  'std_logic', 'std_ulogic', 'std_logic_vector', 'std_ulogic_vector', 'unsigned', 'signed',
  'integer', 'natural', 'positive', 'boolean', 'bit', 'bit_vector', 'character', 'string',
  'time', 'real', 'rising_edge', 'falling_edge', 'to_integer', 'to_unsigned', 'to_signed',
  'resize', 'shift_left', 'shift_right', 'ieee', 'std_logic_1164', 'numeric_std', 'work', 'now',
];

/** Keywords written as one word, and what VHDL wants instead (§ 4.7). */
export const JOINED_KEYWORDS: ReadonlyMap<string, string> = new Map([
  ['endif', 'end if'],
  ['endcase', 'end case'],
  ['endloop', 'end loop'],
  ['endprocess', 'end process'],
  ['endentity', 'end entity'],
  ['endarchitecture', 'end architecture'],
  ['endcomponent', 'end component'],
  ['endgenerate', 'end generate'],
  ['endfunction', 'end function'],
  ['endprocedure', 'end procedure'],
  ['endpackage', 'end package'],
  ['endrecord', 'end record'],
  ['endblock', 'end block'],
  ['elseif', 'elsif'],
  ['elif', 'elsif'],
]);

export function isReservedWord(word: string): boolean {
  return RESERVED_WORDS.has(word.toLowerCase());
}

const LIBRARY_NAME_SET: ReadonlySet<string> = new Set(LIBRARY_NAMES);

export function isLibraryName(word: string): boolean {
  return LIBRARY_NAME_SET.has(word.toLowerCase());
}
