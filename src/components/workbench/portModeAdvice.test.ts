// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * GHDL's `port "SW" can't be assigned` (measured on GHDL 6.0.0 with --std=08), and
 * HDLBoard's warning on an output port read, which that standard allows.
 */

import { describe, expect, test } from 'vitest';
import { adviseDiagnostics, type AdvisedDiagnostic } from './diagnosticAdvice';
import { locateDiagnostics, type RunSnapshot } from './diagnosticLocation';
import { parseDiagnostics } from './diagnostics';
import { outputReadWarnings } from './outputReads';

const ENTITY = [
  'library ieee;',
  'use ieee.std_logic_1164.all;',
  'entity top is',
  '    port (',
  '        CLOCK_50 : in  std_logic;',
  '        SW       : in  std_logic_vector(9 downto 0);',
  '        KEY_N    : std_logic_vector(3 downto 0);',
  '        LEDR     : out std_logic_vector(9 downto 0)',
  '    );',
  'end entity;',
  'architecture rtl of top is',
  '    signal count : std_logic_vector(9 downto 0);',
  'begin',
];
/** The 1-based line of the first statement. */
const STATEMENT_LINE = ENTITY.length + 1;

function run(...statements: string[]): RunSnapshot {
  const content = [...ENTITY, ...statements, 'end architecture;', ''].join('\n');
  return { files: [{ id: 'top', name: 'top.vhdl', content }] };
}

/** The advice on GHDL's error for `port`, at its column on the first statement. */
function advised(statement: string, port: string): AdvisedDiagnostic | undefined {
  const snapshot = run(statement);
  const column = statement.indexOf(port) + 1;
  const output = `top.vhdl:${STATEMENT_LINE}:${column}:error: port "${port}" can't be assigned\n${statement}\n${' '.repeat(column - 1)}^\n`;
  return adviseDiagnostics(locateDiagnostics(parseDiagnostics(output), snapshot, snapshot.files), snapshot)[0];
}

describe('an input port assigned', () => {
  test('the two sides the wrong way round: swap them', () => {
    expect(advised('SW <= LEDR;', 'SW')?.advice?.headline).toBe(
      '`SW` is an input from the board, so the design can only read it — swap the two sides: `LEDR <= SW;`.',
    );
  });

  test('keeps an index or a slice on both sides', () => {
    expect(advised('    SW(3 downto 0) <= LEDR(7 downto 4);', 'SW')?.advice?.headline).toContain('`LEDR(7 downto 4) <= SW(3 downto 0);`');
  });

  test('underlines what is assigned', () => {
    expect(advised('    SW(2) <= LEDR(2);', 'SW')?.advice?.span).toEqual({ start: 4, end: 9 });
  });

  test('a port written without a mode is an input too', () => {
    expect(advised('KEY_N <= LEDR(3 downto 0);', 'KEY_N')?.advice?.headline).toContain('swap the two sides');
  });

  test('from a signal: no swap, since the signal may be meant otherwise', () => {
    expect(advised('SW <= count;', 'SW')?.advice?.headline).toBe(
      '`SW` is an input port (in): the board drives it, so the design can only read it — assign an output port or a signal instead.',
    );
  });

  test('from an expression: no swap', () => {
    expect(advised('SW <= not LEDR;', 'SW')?.advice?.headline).toMatch(/assign an output port or a signal instead/);
  });

  test('a conditional assignment: no swap, the condition would be lost', () => {
    expect(advised("SW <= LEDR when CLOCK_50 = '1' else count;", 'SW')?.advice?.headline).toMatch(/assign an output port or a signal instead/);
  });
});

describe('outputReadWarnings: an output port read, which VHDL-93 forbids', () => {
  const warnings = (...statements: string[]) => outputReadWarnings(run(...statements));

  test('warns on a read, in GHDL\'s format, at the port', () => {
    expect(warnings('LEDR <= LEDR(8 downto 0) & SW(0);')[0]).toMatch(new RegExp(`^top\\.vhdl:${STATEMENT_LINE}:9:warning: output port "LEDR" is read here`));
  });

  test('says what to do instead', () => {
    expect(warnings('count <= LEDR;')[0]).toMatch(/read a signal instead, and assign the port from it\.$/);
  });

  test('warns on a condition that reads it', () => {
    expect(warnings("  if LEDR(0) = '1' then")).toHaveLength(1);
  });

  test('an output only assigned is fine', () => {
    expect(warnings('LEDR <= SW;')).toEqual([]);
  });

  test('an attribute of an output reads no value', () => {
    expect(warnings("count <= (count'range => '0') when LEDR'length = 10 else count;")).toEqual([]);
  });

  test('a comment is no read', () => {
    expect(warnings('count <= SW; -- not LEDR')).toEqual([]);
  });

  test('an input port assigned from it is GHDL\'s error already, not warned about too', () => {
    expect(warnings('SW <= LEDR;')).toEqual([]);
  });

  test('a port map connects an output rather than reading it', () => {
    expect(warnings('u1: entity work.child port map (q => LEDR);')).toEqual([]);
  });
});
