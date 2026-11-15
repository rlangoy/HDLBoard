// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Cases from the review of the operator advice: a suggested rewrite must keep the
 * design's meaning and must itself compile.
 */

import { describe, expect, test } from 'vitest';
import { adviseDiagnostics } from './diagnosticAdvice';
import { locateDiagnostics, type RunSnapshot } from './diagnosticLocation';
import { parseDiagnostics } from './diagnostics';

const HEADER = [
  'library ieee;',
  'use ieee.std_logic_1164.all;',
  'use ieee.numeric_std.all;',
  'entity e is',
  'end entity;',
  'architecture rtl of e is',
  '  signal a, b, result : std_logic_vector(3 downto 0);',
  '  signal led : std_logic;',
  'begin',
];

/** The headline for GHDL's "no function declarations for operator" at `operator` on line 10. */
function headline(statement: string, operator: string): string | undefined {
  const content = [...HEADER, statement, 'end architecture;', ''].join('\n');
  const snapshot: RunSnapshot = { files: [{ id: 'f', name: 'e.vhd', content }] };
  const column = statement.indexOf(` ${operator} `) + 2;
  const output = `e.vhd:10:${column}:error: no function declarations for operator "${operator}"\n${statement}\n${' '.repeat(column - 1)}^\n`;
  return adviseDiagnostics(locateDiagnostics(parseDiagnostics(output), snapshot, snapshot.files), snapshot)[0]?.advice?.headline;
}

describe('a vector compared with a number', () => {
  test('keeps the number first when the student wrote it first', () => {
    expect(headline("  led <= '1' when 5 < a else '0';", '<')).toBe(
      '`a` is a `std_logic_vector`, not a number — compare it as a number, `5 < unsigned(a)`, or with bits, `"0101" < a`.',
    );
  });

  test('keeps the vector first when the student wrote it first', () => {
    expect(headline("  led <= '1' when a < 5 else '0';", '<')).toMatch(/`unsigned\(a\) < 5`, or with bits, `a < "0101"`/);
  });
});

describe('arithmetic on vectors', () => {
  test('converts both operands when both are vectors', () => {
    expect(headline('  result <= a + b;', '+')).toMatch(/`std_logic_vector\(unsigned\(a\) \+ unsigned\(b\)\)`/);
  });

  test('converts only the vector when the other operand is a number', () => {
    expect(headline('  result <= a + 1;', '+')).toMatch(/`std_logic_vector\(unsigned\(a\) \+ 1\)`/);
  });
});
