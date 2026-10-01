// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { explainUnconnectedPorts, planExtraPorts, unconnectedPorts, type TopSource } from './extraPorts.js';
import { portDeclarations } from './vhdlPorts.js';

function topOf(content: string, entityName = 'top'): TopSource {
  const ports = new Set(portDeclarations(content, entityName).map((port) => port.name.toLowerCase()));
  return { fileName: 'top.vhdl', content, entityName, ports };
}

const EXTRAS = topOf(`entity top is
  port (
    SW    : in  std_logic_vector(9 downto 0);
    Dummy : in  std_logic_vector(9 downto 0);
    btn   : in  ieee.std_logic_1164.std_logic;
    cnt   : in  unsigned(3 downto 0);
    keep  : in  std_logic := '1';
    count : in  integer;
    bus_x : inout std_logic_vector(7 downto 0);
    Shown : out std_logic_vector(9 downto 0);
    LEDRR : out std_logic_vector(9 downto 0)
  );
end entity;`);

const TYPO = topOf(`entity DE1_SoC is
    port (
        CLOCK_50 : in  std_logic;
        SdsW     : in  std_logic_vector(9 downto 0);
        LEDR     : out std_logic_vector(9 downto 0)
    );
end entity;`, 'DE1_SoC');

const GHDL_OPEN_SDSW = `hdl_board_tb.vhdl:52:3:error: port "SdsW" of mode IN must be connected
  uut: entity work.DE1_SoC
  ^`;

const headlines = (top: TopSource): string[] => planExtraPorts(top).warnings.map((warning) => warning.split('\n')[0]);

describe('planExtraPorts: the testbench values', () => {
  test('holds an extra bit at \'0\' and an extra constrained vector at all zeros', () => {
    assert.deepEqual(planExtraPorts(EXTRAS).tiedInputs, [
      { name: 'Dummy', value: "(others => '0')" },
      { name: 'btn', value: "'0'" },
      { name: 'cnt', value: "(others => '0')" },
    ]);
  });
});

describe('planExtraPorts: the warnings', () => {
  test('warns about every extra port the run goes on without, in declaration order', () => {
    assert.deepEqual(headlines(EXTRAS), [
      'Warning: `Dummy` (top.vhdl, line 4) is not a board input, so the board holds it at 0.',
      'Warning: `btn` (top.vhdl, line 5) is not a board input, so the board holds it at 0.',
      'Warning: `cnt` (top.vhdl, line 6) is not a board input, so the board holds it at 0.',
      'Warning: `bus_x` (top.vhdl, line 9) is not a board port, so the board does not connect it.',
      'Warning: `Shown` (top.vhdl, line 10) is not a board output, so the board does not show it.',
      'Warning: `LEDRR` (top.vhdl, line 11) is not a board output — did you mean `LEDR`? The board does not show it.',
    ]);
  });

  test('suggests the board input a held input was probably meant to be', () => {
    assert.deepEqual(headlines(TYPO), [
      'Warning: `SdsW` (top.vhdl, line 4) is not a board input — did you mean `SW`? The board holds it at 0.',
    ]);
  });

  test('advises simulating a testbench, on a second line', () => {
    assert.equal(
      planExtraPorts(EXTRAS).warnings[0].split('\n')[1],
      '  Not a syntax error: a port like this is normal in a design meant for a testbench. ' +
        'To drive it, simulate a testbench that instantiates top.',
    );
  });

  test('is not in GHDL\'s file:line: shape, so the editor gives it only a quiet mark', () => {
    assert.ok(planExtraPorts(EXTRAS).warnings.every((warning) => !/:\d+:/.test(warning)));
  });
});

describe('unconnectedPorts', () => {
  test('reads the open ports out of GHDL\'s text about the testbench', () => {
    assert.deepEqual(unconnectedPorts(GHDL_OPEN_SDSW), [{ name: 'SdsW', message: 'port "SdsW" of mode IN must be connected' }]);
  });

  test('ignores the same sentence about a file the student wrote', () => {
    assert.deepEqual(unconnectedPorts('top.vhdl:12:3:error: port "a" of mode IN must be connected'), []);
  });
});

describe('explainUnconnectedPorts', () => {
  test('reports an open input on its own declaration, in GHDL\'s shape', () => {
    assert.equal(
      explainUnconnectedPorts(GHDL_OPEN_SDSW, TYPO),
      [
        'top.vhdl:4:9:error: `SdsW` is not a board input — did you mean `SW`? Nothing on the board drives this port.',
        "top.vhdl:4:9:error: (the board's inputs are CLOCK_50, CLOCK_500Hz, SW, KEY_N; give the port a default value with := to keep it)",
        'top.vhdl:4:9:error: (GHDL: port "SdsW" of mode IN must be connected)',
      ].join('\n'),
    );
  });

  test('keeps GHDL\'s own text for any other testbench error', () => {
    assert.equal(explainUnconnectedPorts('hdl_board_tb.vhdl:55:15:error: actual constraints don\'t match formal ones', TYPO), undefined);
  });

  test('keeps GHDL\'s own text when the port cannot be found in the top file', () => {
    assert.equal(explainUnconnectedPorts(GHDL_OPEN_SDSW, { ...TYPO, content: 'entity DE1_SoC is end;' }), undefined);
  });
});
