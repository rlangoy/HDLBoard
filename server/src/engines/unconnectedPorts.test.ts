// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  explainUnconnectedPorts,
  extraInputWarnings,
  findPortDeclaration,
  ghdlPosition,
  portDeclarations,
  suggestBoardInput,
  tiedInputs,
  unconnectedPorts,
} from './unconnectedPorts.js';

const TYPO_TOP = `library ieee;
use ieee.std_logic_1164.all;

entity DE1_SoC is
    port (
        CLOCK_50 : in  std_logic;
        SdsW       : in  std_logic_vector(9 downto 0);
        KEY_N    : in  std_logic_vector(3 downto 0);
        LEDR     : out std_logic_vector(9 downto 0)
    );
end entity;

architecture rtl of DE1_SoC is
begin
    LEDR <= SdsW;
end architecture;
`;

const GHDL_TYPO = `hdl_board_tb.vhdl:52:3:error: port "SdsW" of mode IN must be connected
  uut: entity work.DE1_SoC
  ^`;

const typoTop = {
  fileName: 'DE1_SoC.vhdl',
  content: TYPO_TOP,
  entityName: 'DE1_SoC',
  ports: new Set(['clock_50', 'sdsw', 'key_n', 'ledr']),
};

describe('unconnected board inputs', () => {
  test('reads the open ports out of GHDL\'s text', () => {
    assert.deepEqual(unconnectedPorts(GHDL_TYPO), [{ name: 'SdsW', message: 'port "SdsW" of mode IN must be connected' }]);
    assert.deepEqual(unconnectedPorts('hdl_board_tb.vhdl:55:15:error: actual constraints don\'t match formal ones'), []);
  });

  test('only takes the message from the generated testbench, never from a student file', () => {
    assert.deepEqual(unconnectedPorts('top.vhdl:12:3:error: port "a" of mode IN must be connected'), []);
  });

  test('finds the declaration of the port, not a later use of the name', () => {
    const offset = findPortDeclaration(TYPO_TOP, 'DE1_SoC', 'sdsw');
    assert.equal(offset, TYPO_TOP.indexOf('SdsW'));
    assert.deepEqual(ghdlPosition(TYPO_TOP, offset ?? 0), { line: 7, column: 9 });
  });

  test('finds a name in a list, past a comment that mentions it', () => {
    const src = 'entity t is\n  port ( -- BTN is a button\n    a, BTN : in std_logic; LEDR : out std_logic);\nend entity;';
    assert.deepEqual(ghdlPosition(src, findPortDeclaration(src, 't', 'btn') ?? 0), { line: 3, column: 8 });
  });

  test('does not look outside the entity\'s port clause', () => {
    const src = 'entity t is\n  generic (BTN : integer := 1);\n  port (LEDR : out std_logic);\nend entity;';
    assert.equal(findPortDeclaration(src, 't', 'btn'), undefined);
    assert.equal(findPortDeclaration(src, 'other', 'ledr'), undefined);
  });

  test('counts a tab to the next multiple of 8, as GHDL does', () => {
    assert.deepEqual(ghdlPosition('\tSdsW', 1), { line: 1, column: 9 });
  });

  test('suggests the board input the entity is missing', () => {
    assert.equal(suggestBoardInput('SdsW', typoTop.ports), 'SW');
    assert.equal(suggestBoardInput('KEY', new Set(['sw'])), 'KEY_N');
    assert.equal(suggestBoardInput('clock50', new Set()), 'CLOCK_50');
  });

  test('suggests nothing for a name far from every board input, or for one already declared', () => {
    assert.equal(suggestBoardInput('BTN', new Set()), undefined);
    assert.equal(suggestBoardInput('SdsW', new Set(['sw'])), undefined);
  });

  test('reports the port on its own declaration, in GHDL\'s shape', () => {
    const text = explainUnconnectedPorts(GHDL_TYPO, typoTop);
    assert.equal(
      text,
      [
        'DE1_SoC.vhdl:7:9:error: `SdsW` is not a board input — did you mean `SW`? Nothing on the board drives this port.',
        "DE1_SoC.vhdl:7:9:error: (the board's inputs are CLOCK_50, CLOCK_500Hz, SW, KEY_N; give the port a default value with := to keep it)",
        'DE1_SoC.vhdl:7:9:error: (GHDL: port "SdsW" of mode IN must be connected)',
      ].join('\n'),
    );
  });

  test('keeps GHDL\'s own text when the error is about something else or the port cannot be found', () => {
    assert.equal(explainUnconnectedPorts('hdl_board_tb.vhdl:55:15:error: actual constraints don\'t match formal ones', typoTop), undefined);
    assert.equal(explainUnconnectedPorts(GHDL_TYPO, { ...typoTop, content: 'entity DE1_SoC is end;' }), undefined);
  });
});

const EXTRAS_TOP = `entity top is
  port (
    SW    : in  std_logic_vector(9 downto 0);
    Dummy : in  std_logic_vector(9 downto 0);
    btn   : in  ieee.std_logic_1164.std_logic;
    cnt   : in  unsigned(3 downto 0);
    keep  : in  std_logic := '1';
    count : in  integer;
    bus_x : inout std_logic_vector(7 downto 0);
    LEDR  : out std_logic_vector(9 downto 0)
  );
end entity;`;

const extrasTop = {
  fileName: 'top.vhdl',
  content: EXTRAS_TOP,
  entityName: 'top',
  ports: new Set(['sw', 'dummy', 'btn', 'cnt', 'keep', 'count', 'bus_x', 'ledr']),
};

describe('extra inputs held at 0', () => {
  test('reads mode, type, constraint and default of every port', () => {
    const ports = portDeclarations(EXTRAS_TOP, 'top').map(({ name, mode, type, constrained, hasDefault }) =>
      [name, mode, type, constrained, hasDefault].join(' '));
    assert.deepEqual(ports, [
      'SW in std_logic_vector true false',
      'Dummy in std_logic_vector true false',
      'btn in std_logic false false',
      'cnt in unsigned true false',
      'keep in std_logic false true',
      'count in integer false false',
      'bus_x inout std_logic_vector true false',
      'LEDR out std_logic_vector true false',
    ]);
  });

  test('holds a bit at \'0\' and a vector at all zeros; not a board port, a default, an integer or an inout', () => {
    const tied = tiedInputs(extrasTop).map(({ port, value }) => `${port.name} => ${value}`);
    assert.deepEqual(tied, ["Dummy => (others => '0')", "btn => '0'", "cnt => (others => '0')"]);
  });

  test('warns on each held input\'s own declaration', () => {
    const warnings = extraInputWarnings(extrasTop, tiedInputs(extrasTop));
    assert.equal(warnings.length, 3);
    const [headline, detail] = warnings[0].split('\n');
    assert.equal(headline, 'top.vhdl:4:5:warning: `Dummy` is not a board input, so it is held at 0.');
    assert.match(detail, /^top\.vhdl:4:5:warning: \(the board's inputs are CLOCK_50, CLOCK_500Hz, SW, KEY_N; /);
  });

  test('suggests the board input a held input was probably meant to be', () => {
    const [warning] = extraInputWarnings(typoTop, tiedInputs(typoTop));
    assert.equal(warning.split('\n')[0], 'DE1_SoC.vhdl:7:9:warning: `SdsW` is not a board input — did you mean `SW`? It is held at 0.');
  });
});
