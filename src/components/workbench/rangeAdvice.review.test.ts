// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Cases from the review of the range advice: advice must never claim more than
 * the code shows — a direction the operand's sign does not tell, a slice that may
 * be in range, or a generic's default when an instance may set it.
 */

import { describe, expect, test } from 'vitest';
import { adviseLogDiagnostics } from './diagnosticAdvice';
import type { LocatedDiagnostic, RunSnapshot } from './diagnosticLocation';

function headline(files: readonly string[], line: number, message = 'bound check failure'): string | undefined {
  const snapshot: RunSnapshot = { files: files.map((content, i) => ({ id: `f${i}`, name: `f${i}.vhd`, content })) };
  const error: LocatedDiagnostic = { fileId: 'f0', line, severity: 'error', message, details: [] };
  return adviseLogDiagnostics([error], snapshot)[0].advice?.headline;
}

const COUNTER = [
  '  signal count : integer range 0 to 9;',
  '  signal delta : integer;',
  'begin',
  '  count <= count + delta;',
  '  count <= count - delta;',
  '  count <= count + 1;',
  '  count <= count - STEP;',
  '  constant STEP : integer := 2;',
].join('\n');

describe('the direction of a range error', () => {
  test('adding a value of unknown sign does not say which end was passed', () => {
    expect(headline([COUNTER], 4)).toBe(
      '`count + delta` gave `count` a value outside its range 0 to 9 — keep the value within the range, or make the range wider.',
    );
  });

  test('subtracting a value of unknown sign does not say which end was passed', () => {
    expect(headline([COUNTER], 5)).toMatch(/^`count - delta` gave `count` a value outside its range/);
  });

  test('adding a positive number passes the top', () => {
    expect(headline([COUNTER], 6)).toMatch(/^`count \+ 1` went above 9/);
  });

  test('subtracting a positive constant passes the bottom', () => {
    expect(headline([COUNTER], 7)).toMatch(/^`count - STEP` went below 0/);
  });
});

const SLICE_IN_CONCATENATION = [
  '  signal a : std_logic_vector(7 downto 0);',
  "  signal b : std_logic;",
  '  signal y : std_logic_vector(3 downto 0);',
  '  signal i : integer;',
  'begin',
  '  y <= a(i downto i - 3) & b;',
  '  y <= a(i downto i - 3);',
  '  y <= a(i downto 2);',
].join('\n');

describe('a slice and a width', () => {
  test('a slice of known length in a value of the wrong width: the width is the cause', () => {
    expect(headline([SLICE_IN_CONCATENATION], 6)).toMatch(/^`y` has 4 bits but `a\(i downto i - 3\) & b` has 5 bits/);
  });

  test('a slice of the right length that may leave its vector is still the cause', () => {
    expect(headline([SLICE_IN_CONCATENATION], 7)).toBe(
      'The slice `a(i downto i - 3)` must stay inside `a` (7 downto 0) and have 4 bits, like `y` — check the value of `i` here.',
    );
  });

  test('a slice whose length depends on a value is still the cause', () => {
    expect(headline([SLICE_IN_CONCATENATION], 8)).toMatch(/^The slice `a\(i downto 2\)` must stay inside `a`/);
  });
});

const TWO_INDEXES = [
  '  signal a : std_logic_vector(7 downto 0);',
  '  signal y : std_logic_vector(3 downto 0);',
  '  signal i, j : integer;',
  'begin',
  '  y <= a(i downto j);',
  '  y <= a(i downto i - 4);',
  '  y <= a(7 downto 3);',
  '  y <= a(2 * i downto i);',
].join('\n');

describe('a slice whose ends move', () => {
  test('two independent ends give no width: i downto j may have any length', () => {
    expect(headline([TWO_INDEXES], 5)).toMatch(/^The slice `a\(i downto j\)` must stay inside `a` \(7 downto 0\) and have 4 bits, like `y`/);
  });

  test('ends that move together but not by the same amount give no width', () => {
    expect(headline([TWO_INDEXES], 8)).toMatch(/^The slice `a\(2 \* i downto i\)` must stay inside/);
  });

  test('a width mismatch with a slice that may also leave its vector names both', () => {
    expect(headline([TWO_INDEXES], 6)).toBe(
      '`y` has 4 bits but `a(i downto i - 4)` has 5 bits — both sides of an assignment need the same number of bits.' +
        ' The slice `a(i downto i - 4)` must also stay inside `a` (7 downto 0) — check the value of `i` here.',
    );
  });

  test('a slice certainly outside its vector failed first, before any width was compared', () => {
    const outside = TWO_INDEXES.replace('  y <= a(7 downto 3);', '  y <= a(9 downto 5);');
    expect(headline([outside], 7)).toBe('`a(9 downto 5)` reaches outside `a`, which only has indexes 7 downto 0.');
  });

  test('a width mismatch with a slice that is certainly inside its vector is the cause alone', () => {
    expect(headline([TWO_INDEXES], 7)).toBe(
      '`y` has 4 bits but `a(7 downto 3)` has 5 bits — both sides of an assignment need the same number of bits.',
    );
  });
});

const SUB = [
  'entity sub is',
  '  generic (WIDTH : integer := 8);',
  '  port (d : in std_logic_vector(WIDTH - 1 downto 0));',
  'end entity;',
  'architecture rtl of sub is',
  '  signal y : std_logic_vector(3 downto 0);',
  'begin',
  '  y <= d;',
  'end architecture;',
].join('\n');

describe('a generic', () => {
  test('its default is its value when no instance sets it', () => {
    expect(headline([SUB], 8)).toMatch(/^`y` has 4 bits but `d` has 8 bits/);
  });

  test('its default is not its value when an instance sets it', () => {
    const top = 'u : entity work.sub generic map (WIDTH => 6) port map (d => x);';
    expect(headline([SUB, top], 8)).toBe(
      '`y` has 4 bits (3 downto 0), so the value assigned to it must have exactly 4 bits too.',
    );
  });

  test('a generic map by position sets it too', () => {
    const top = 'u : entity work.sub generic map (6) port map (d => x);';
    expect(headline([SUB, top], 8)).toMatch(/^`y` has 4 bits \(3 downto 0\), so/);
  });
});
