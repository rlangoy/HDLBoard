// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { declaredNames } from './declaredNames';

describe('declaredNames', () => {
  test.each([
    ['signal', 'signal counter : integer;', 'counter'],
    ['constant', 'constant TOGGLE_COUNT : integer := 125;', 'TOGGLE_COUNT'],
    ['variable', 'variable acc : natural;', 'acc'],
    ['entity', 'entity blinkTest is', 'blinkTest'],
    ['architecture', 'architecture rtl of blinkTest is', 'rtl'],
    ['component', 'component counter8 is', 'counter8'],
    ['type', 'type state_t is range 0 to 3;', 'state_t'],
    ['subtype', 'subtype byte is std_logic_vector(7 downto 0);', 'byte'],
    ['function', 'function parity(v : bit_vector) return bit;', 'parity'],
    ['procedure', 'procedure tick;', 'tick'],
    ['package', 'package defs is', 'defs'],
    ['package body', 'package body defs is', 'defs'],
    ['alias', 'alias msb : bit is v(7);', 'msb'],
    ['file', 'file stimuli : text;', 'stimuli'],
    ['a port', 'port (\n  CLOCK_500Hz : in std_logic;\n  SW : in bit\n);', 'CLOCK_500Hz'],
    ['a generic', 'generic (WIDTH : natural := 8);', 'WIDTH'],
    ['a label', 'blink : process (clk)', 'blink'],
    ['an instance label', 'u0 : entity work.counter port map (clk => clk);', 'u0'],
    ['an enumeration literal', 'type state_t is (IDLE, RUN, DONE);', 'RUN'],
  ])('%s', (_case, source, name) => {
    expect(declaredNames(source)).toContain(name);
  });

  test('every name of a list before the colon', () => {
    expect(declaredNames('signal a, b, c : bit;')).toEqual(['a', 'b', 'c']);
  });

  test('names in comments are ignored', () => {
    expect(declaredNames('-- signal ghost : bit;')).toEqual([]);
  });

  test('names in strings are ignored', () => {
    expect(declaredNames('report "signal ghost : bit";')).toEqual([]);
  });

  test('an assignment is not a declaration', () => {
    expect(declaredNames('counter := counter + 1;')).toEqual([]);
  });

  test('reserved words are never names', () => {
    expect(declaredNames('port (signal a : in bit);')).toEqual(['a']);
  });

  test('a name is listed once, as first written', () => {
    expect(declaredNames('signal Count : bit;\nsignal x : bit;\nCOUNT : process')).toEqual(['Count', 'x']);
  });

  test('a misspelled keyword before a declaration is not a name', () => {
    expect(declaredNames("signl led_state : std_logic := '0';")).toEqual(['led_state']);
  });
});
