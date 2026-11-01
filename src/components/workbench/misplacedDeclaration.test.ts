// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Declarations after `begin` and extra `end`s, through parse → locate → advise
 * with GHDL's own output (`ghdl -a --std=08`, GHDL 5.0.1 mcode, Windows).
 */

import { describe, expect, test } from 'vitest';
import { adviseDiagnostics, revealTarget, type AdvisedDiagnostic } from './diagnosticAdvice';
import { locateDiagnostics, type RunSnapshot } from './diagnosticLocation';
import { parseDiagnostics } from './diagnostics';
import { architectureBegin, designUnitEnd, statementRegionHome } from './misplacedDeclaration';

function advise(name: string, content: string, output: string): AdvisedDiagnostic[] {
  const snapshot: RunSnapshot = { files: [{ id: 'f', name, content }] };
  return adviseDiagnostics(locateDiagnostics(parseDiagnostics(output), snapshot, snapshot.files), snapshot);
}

/** line → headline, for every error, muted or not. */
function headlines(advised: readonly AdvisedDiagnostic[]): Record<number, string | undefined> {
  return Object.fromEntries(advised.map((d) => [d.line, d.advice?.headline]));
}

const DE1_SOC = `library ieee;
use ieee.std_logic_1164.all;

-- The real DE1-SoC top-level interface: these are the board's own pin
-- names, not a stand-in for them, so this file can go straight into
-- Quartus with only a pin assignment added. Every port here is optional
-- for the simulator — a design that only declares SW and LEDR is a
-- perfectly normal first lab.
entity DE1_SoC is
    port (
        CLOCK_50 : in  std_logic;
        SW       : in  std_logic_vector(9 downto 0);
        KEY_N    : in  std_logic_vector(3 downto 0);
        LEDR     : out std_logic_vector(9 downto 0);
        HEX0_N   : out std_logic_vector(6 downto 0);
        HEX1_N   : out std_logic_vector(6 downto 0);
        HEX2_N   : out std_logic_vector(6 downto 0);
        HEX3_N   : out std_logic_vector(6 downto 0);
        HEX4_N   : out std_logic_vector(6 downto 0);
        HEX5_N   : out std_logic_vector(6 downto 0)
    );
end entity;

architecture rtl of DE1_SoC is
begin
    signal a : std_logic;
    signal b : std_logic;
    signal y : std_logic;

    a <= SW(0);
    b <= SW(1);

    y <= a and b;

    LEDR(0) <= y;
    LEDR(9 downto 1) <= (others => '0');
end architecture rtl;

end architecture;



end architecture;
`;

const DE1_SOC_OUTPUT =
  "top.vhd:26:5:error: unexpected token 'signal' in a concurrent statement list\n    signal a : std_logic;\n    ^\ntop.vhd:27:5:error: unexpected token 'signal' in a concurrent statement list\n    signal b : std_logic;\n    ^\ntop.vhd:28:5:error: unexpected token 'signal' in a concurrent statement list\n    signal y : std_logic;\n    ^\ntop.vhd:39:1:error: missing entity, architecture, package or configuration\nend architecture;\n^\ntop.vhd:43:1:error: missing entity, architecture, package or configuration\nend architecture;\n^\n";

describe('signals after the architecture’s begin, and extra ends', () => {
  const advised = advise('top.vhd', DE1_SOC, DE1_SOC_OUTPUT);

  test('each signal says it goes between is and begin, and points at the begin', () => {
    const begin = 'move this line above the `begin` on line 25.';
    expect(headlines(advised)).toMatchObject({
      26: `\`signal\` declarations go between \`is\` and \`begin\` — ${begin}`,
      27: `\`signal\` declarations go between \`is\` and \`begin\` — ${begin}`,
      28: `\`signal\` declarations go between \`is\` and \`begin\` — ${begin}`,
    });
    expect(advised.filter((d) => d.line <= 28).map((d) => d.advice?.relatedLine)).toEqual([25, 25, 25]);
  });

  test('none of them is muted as a follow-on: each is a mistake of its own', () => {
    expect(advised.map((d) => d.advice?.followOnOf)).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });

  test('each extra end names the line that already closed the architecture', () => {
    const extra = 'Extra `end` — line 37 already closed the architecture. Delete this line.';
    expect(headlines(advised)).toMatchObject({ 39: extra, 43: extra });
    const line39 = advised.find((d) => d.line === 39);
    expect(line39?.advice?.span).toEqual({ start: 0, end: 'end architecture;'.length });
  });

  test('the editor goes to the begin the first signal should move above', () => {
    expect(revealTarget(advised)).toEqual({ fileId: 'f', line: 25 });
  });
});

describe('declarations after a process’s begin', () => {
  const PROCESS = `entity e is end;
architecture a of e is
begin
  process
  begin
    variable v : integer;
    wait;
  end process;
  constant c : integer := 1;
end;
`;
  const OUTPUT =
    "p.vhd:6:5:error: declaration not allowed within statements\n    variable v : integer;\n    ^\np.vhd:9:3:error: unexpected token 'constant' in a concurrent statement list\n  constant c : integer := 1;\n  ^\n";

  test('a variable goes between process and begin; a constant after the process still in the architecture', () => {
    expect(headlines(advise('p.vhd', PROCESS, OUTPUT))).toEqual({
      6: '`variable` declarations go between `process` and `begin` — move this line above the `begin` on line 5.',
      9: '`constant` declarations go between `is` and `begin` — move this line above the `begin` on line 3.',
    });
  });

  const IN_IF = `library ieee; use ieee.std_logic_1164.all;
entity e is port (sw : in std_logic; q : out std_logic); end;
architecture a of e is
begin
  process(sw)
  begin
    if sw = '1' then
      signal z : std_logic;
      variable w : integer;
    end if;
  end process;
end;
`;
  const IN_IF_OUTPUT =
    'inif.vhd:8:7:error: declaration not allowed within statements\n      signal z : std_logic;\n      ^\ninif.vhd:9:7:error: declaration not allowed within statements\n      variable w : integer;\n      ^\n';

  test('a signal in a process belongs to the architecture', () => {
    expect(headlines(advise('inif.vhd', IN_IF, IN_IF_OUTPUT))).toEqual({
      8: 'A `signal` cannot be declared in a process — declare it in the architecture, above the `begin` on line 4.',
      9: '`variable` declarations go between `process` and `begin` — move this line above the `begin` on line 6.',
    });
  });
});

describe('where the begin is', () => {
  const lines = (text: string): string[] => text.split('\n');

  test('a function body in the declarations has its own begin, which is skipped', () => {
    const source = lines(`architecture a of e is
  function f(x : integer) return integer is
  begin
    if x > 0 then return 1; end if;
    return 0;
  end function;
  function g return integer;
begin
  signal s : bit;`);
    expect(architectureBegin(source, 9)).toBe(8);
  });

  test('inside a generate, no begin is named: it has a begin of its own', () => {
    const source = lines(`architecture a of e is
begin
  g: for i in 0 to 1 generate
  begin
    signal zz : bit;`);
    expect(architectureBegin(source, 5)).toBeUndefined();
  });

  test('a process ended earlier does not count', () => {
    const source = lines(`architecture a of e is
begin
  process begin wait; end process;
  signal s : bit;`);
    expect(architectureBegin(source, 4)).toBe(2);
  });

  test('a declaration in a function body goes above the function’s begin', () => {
    const source = lines(`  function f return integer is
    constant k : integer := 1;
  begin
    variable v : integer;`);
    expect(statementRegionHome(source, 4)).toEqual({ region: 'subprogram', beginLine: 3 });
  });
});

describe('designUnitEnd', () => {
  test.each([
    ['end architecture;', 'architecture'],
    ['end architecture rtl;', 'architecture'],
    ['END ENTITY;  -- done', 'entity'],
    ['end package body p;', 'package body'],
    ['end;', undefined],
    ['end rtl;', undefined],
  ])('%s closes a design unit', (line, kind) => {
    expect(designUnitEnd(line)).toEqual({ kind });
  });

  test.each(['end if;', 'end process;', 'end process p;', 'end case;', 'end loop;', 'LEDR <= x;', 'end generate;'])(
    '%s does not',
    (line) => {
      expect(designUnitEnd(line)).toBeUndefined();
    },
  );
});
