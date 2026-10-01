// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ghdlPosition, portDeclarations } from './vhdlPorts.js';

const TOP = `entity top is
  port (
    SW    : in  std_logic_vector(9 downto 0);
    btn   : in  ieee.std_logic_1164.std_logic;
    keep  : in  std_logic := '1';
    count : in  integer;
    bus_x : inout std_logic_vector(7 downto 0);
    LEDR  : out std_logic_vector(9 downto 0)
  );
end entity;

architecture rtl of top is
begin
  LEDR <= SW;
end architecture;`;

const summary = (src: string, entity: string): string[] =>
  portDeclarations(src, entity).map(({ name, mode, type, constrained, hasDefault }) =>
    [name, mode, type, constrained, hasDefault].join(' '));

describe('portDeclarations', () => {
  test('reads the mode, type, constraint and default of every port, in order', () => {
    assert.deepEqual(summary(TOP, 'top'), [
      'SW in std_logic_vector true false',
      'btn in std_logic false false',
      'keep in std_logic false true',
      'count in integer false false',
      'bus_x inout std_logic_vector true false',
      'LEDR out std_logic_vector true false',
    ]);
  });

  test('gives each port the offset of its declaration, not of a later use of the name', () => {
    const ledr = portDeclarations(TOP, 'top').find((port) => port.name === 'LEDR');
    assert.equal(ledr?.offset, TOP.indexOf('LEDR'));
  });

  test('reads every name of a list, past a comment that mentions one of them', () => {
    const src = 'entity t is\n  port ( -- BTN is a button\n    a, BTN : in std_logic; LEDR : out std_logic);\nend entity;';
    assert.deepEqual(summary(src, 't'), ['a in std_logic false false', 'BTN in std_logic false false', 'LEDR out std_logic false false']);
  });

  test('takes a declaration without a mode as an input', () => {
    assert.deepEqual(summary('entity t is port (a : std_logic); end;', 't'), ['a in std_logic false false']);
  });

  test('does not read the generic clause', () => {
    const src = 'entity t is\n  generic (BTN : integer := 1);\n  port (LEDR : out std_logic);\nend entity;';
    assert.deepEqual(summary(src, 't'), ['LEDR out std_logic false false']);
  });

  test('finds nothing for another entity, or one without a port clause', () => {
    assert.deepEqual(portDeclarations(TOP, 'other'), []);
    assert.deepEqual(portDeclarations('entity t is end entity;', 't'), []);
  });
});

describe('ghdlPosition', () => {
  test('gives the 1-based line and column of an offset', () => {
    assert.deepEqual(ghdlPosition(TOP, TOP.indexOf('btn')), { line: 4, column: 5 });
  });

  test('counts a tab to the next multiple of 8, as GHDL does', () => {
    assert.deepEqual(ghdlPosition('\tSdsW', 1), { line: 1, column: 9 });
  });

  test('counts the UTF-8 bytes of a character, as GHDL does', () => {
    assert.deepEqual(ghdlPosition('-- ø\nx', 5), { line: 2, column: 1 });
    assert.deepEqual(ghdlPosition('ø x', 2), { line: 1, column: 4 });
  });
});
