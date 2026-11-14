// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { lengthOf, VhdlDeclarations } from './vhdlDeclarations';

const SOURCE = `library ieee;
use ieee.std_logic_1164.all;

entity top is
  generic (WIDTH : integer := 6);
  port (
    SW   : in  std_logic_vector(9 downto 0); -- signal fake : bit;
    LEDR : out std_logic_vector(WIDTH - 1 downto 0)
  );
end entity;

architecture rtl of top is
  constant DEPTH : integer := 2 * WIDTH;
  type mem_t is array (0 to DEPTH - 1) of std_logic_vector(7 downto 0);
  type state_t is (IDLE, RUN, DONE);
  subtype digit_t is integer range 0 to 9;
  subtype word_t is std_logic_vector(15 downto 0);
  signal a, b : unsigned(3 downto 0);
  signal mem : mem_t;
  signal state : state_t := IDLE;
  signal digit : digit_t;
  signal word : word_t;
  constant LOOPED : integer := LOOPED + 1;
begin
  process
    variable count : natural := 0;
  begin
    for i in SW'range loop
      null;
    end loop;
    wait;
  end process;
end architecture;
`;

const declarations = new VhdlDeclarations(SOURCE.split('\n'));
const AFTER_BEGIN = 25;
const typeOf = (name: string) => declarations.typeAt(name, AFTER_BEGIN);

describe('VhdlDeclarations', () => {
  test('a port has its mode left out of its type', () => {
    expect(declarations.objectAt('sw', AFTER_BEGIN)?.typeText).toBe('std_logic_vector(9 downto 0)');
  });

  test('a port width that uses a generic is evaluated', () => {
    expect(lengthOf((typeOf('LEDR') as { range?: never }).range)).toBe(6);
  });

  test('every name of a list declaration is declared', () => {
    expect(typeOf('b')).toMatchObject({ kind: 'vector', name: 'unsigned' });
  });

  test('an array type takes its range from constants', () => {
    expect(typeOf('mem')).toMatchObject({ kind: 'vector', name: 'mem_t', range: { left: 0, right: 11 } });
  });

  test('an enumeration knows its literals', () => {
    expect(typeOf('state')).toEqual({ kind: 'enumeration', name: 'state_t', literals: ['IDLE', 'RUN', 'DONE'] });
  });

  test('a subtype of integer keeps its own name and range', () => {
    expect(typeOf('digit')).toMatchObject({ kind: 'number', name: 'digit_t', range: { left: 0, right: 9 } });
  });

  test('a subtype of a vector is a vector', () => {
    expect(typeOf('word')).toMatchObject({ kind: 'vector', name: 'word_t', range: { left: 15, right: 0 } });
  });

  test('natural has its predefined range', () => {
    expect(typeOf('count')).toMatchObject({ kind: 'number', name: 'natural', range: { left: 0 } });
  });

  test("a loop over x'range has x's range", () => {
    expect(typeOf('i')).toMatchObject({ kind: 'number', range: { left: 9, right: 0, direction: 'downto' } });
  });

  test('a declaration written in a comment is not one', () => {
    expect(declarations.objectAt('fake', AFTER_BEGIN)).toBeUndefined();
  });

  test('a constant defined by itself has no value, and does not hang', () => {
    expect(declarations.valueOf('LOOPED', AFTER_BEGIN)).toBeUndefined();
  });

  test('names are found whatever their case', () => {
    expect(declarations.objectAt('ledr', AFTER_BEGIN)?.objectClass).toBe('port');
  });

  test('the port of an entity is found after its header', () => {
    expect(declarations.portAfter(4, 'LEDR')?.line).toBe(8);
  });

  test('the nearest declaration above a line wins', () => {
    const shadowed = new VhdlDeclarations(['signal x : bit;', 'process', '  variable x : integer;', 'begin'].map(String));
    expect(shadowed.objectAt('x', 4)?.objectClass).toBe('variable');
  });
});
