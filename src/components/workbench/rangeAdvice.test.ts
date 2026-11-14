// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { adviseDiagnostics, adviseLogDiagnostics } from './diagnosticAdvice';
import type { LocatedDiagnostic, RunSnapshot } from './diagnosticLocation';

const DESIGN = `architecture a of t is
  signal Count : integer range 0 to 9;
  signal leds : std_logic_vector(7 downto 0);
begin
  process
  begin
    case sel is
      when "11" => COUNT <= count + 1;
      when others => null;
    end case;
    do_something(leds);
    leds <= mystery;
  end process;
end;`;

const SNAPSHOT: RunSnapshot = { files: [{ id: 'f', name: 'f.vhd', content: DESIGN }] };

function runError(line: number, message: string): LocatedDiagnostic {
  return { fileId: 'f', line, severity: 'error', message, details: [] };
}

const headlineOfRun = (line: number, message: string) => adviseLogDiagnostics([runError(line, message)], SNAPSHOT)[0].advice?.headline;

describe('range advice on a run', () => {
  test('a range check in a case choice names the object, whatever its case', () => {
    expect(headlineOfRun(8, 'bound check failure')).toMatch(/^`count \+ 1` went above 9/);
  });

  test('a line the advice cannot read still gets the general direction', () => {
    expect(headlineOfRun(11, 'bound check failure')).toMatch(/^A value on this line is outside/);
  });

  test('an index whose array is not on the line names only the range', () => {
    expect(headlineOfRun(11, 'index (9) out of bounds (7 downto 0)')).toBe(
      'Index 9 is outside the indexes 7 downto 0 of the array on this line.',
    );
  });

  test('a design’s own report that reads like a check gets no advice', () => {
    const report = { ...runError(8, 'bound check failure'), column: 5 };
    expect(adviseLogDiagnostics([report], SNAPSHOT)[0].advice).toBeUndefined();
  });

  test('a run check in an ERROR frame gets the same advice as in a LOG line', () => {
    expect(adviseDiagnostics([runError(8, 'bound check failure')], SNAPSHOT)[0].advice?.headline).toBe(headlineOfRun(8, 'bound check failure'));
  });

  test('a vector assigned something of unknown width is told its own width', () => {
    expect(headlineOfRun(12, 'bound check failure')).toBe(
      '`leds` has 8 bits (7 downto 0), so the value assigned to it must have exactly 8 bits too.',
    );
  });
});

describe('type advice', () => {
  const typeError = (line: number, column: number, message: string): LocatedDiagnostic => ({ ...runError(line, message), column });

  const ascending: RunSnapshot = {
    files: [{ id: 'f', name: 'f.vhd', content: 'signal t : std_logic_vector(0 to 7);\nsignal count : integer;\nled <= t;\nu1 : entity work.e port map (a => count);' }],
  };
  const typeHeadline = (line: number, column: number, message: string) =>
    adviseDiagnostics([{ ...runError(line, message), column }], ascending)[0].advice?.headline;

  test('one bit of a `to` vector is its lowest index', () => {
    expect(typeHeadline(3, 8, 'can\'t match "t" with type STD_ULOGIC')).toContain('`t(0)`');
  });

  test('a conversion with no target to take the width from asks for the number of bits', () => {
    expect(typeHeadline(4, 36, 'can\'t match "count" with type array type "STD_ULOGIC_VECTOR"')).toContain(
      '`std_logic_vector(to_unsigned(count, number_of_bits))`',
    );
  });

  test('a name that is declared nowhere keeps GHDL’s own words', () => {
    const advised = adviseDiagnostics([typeError(12, 13, 'can\'t match "mystery" with type array type "STD_ULOGIC_VECTOR"')], SNAPSHOT);
    expect(advised[0].advice?.headline).toBeUndefined();
  });
});
