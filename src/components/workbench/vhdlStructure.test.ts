// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { architectureAbove, architectureBegin, designUnitEnd, loneWord, statementRegionHome } from './vhdlStructure';

const lines = (text: string): string[] => text.split('\n');

describe('architectureBegin', () => {
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

  test('a ; in a parameter list does not end the function header', () => {
    const source = lines(`architecture a of e is
  function f(a : integer; b : integer) return integer is
  begin
    return a;
  end;
begin
  signal s : bit;`);
    expect(architectureBegin(source, 7)).toBe(6);
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

  test('a function ended with a bare end; does not hide the architecture', () => {
    const source = lines(`architecture a of e is
  function f return integer is begin return 1; end;
begin
  signal s : bit;`);
    expect(architectureBegin(source, 4)).toBe(3);
  });
});

describe('statementRegionHome', () => {
  test('a declaration in a function body goes above the function’s begin', () => {
    const source = lines(`  function f return integer is
    constant k : integer := 1;
  begin
    variable v : integer;`);
    expect(statementRegionHome(source, 4)).toEqual({ region: 'subprogram', beginLine: 3 });
  });

  test('a function the process declares and ends is not where the error is', () => {
    const source = lines(`architecture a of e is
begin
  process
    function f return integer is
    begin
      return 1;
    end function;
  begin
    variable v : integer;`);
    expect(statementRegionHome(source, 9)).toEqual({ region: 'process', beginLine: 8 });
  });

  test('a function declared without a body opens nothing', () => {
    const source = lines(`architecture a of e is
  function g return integer;
begin
  process
  begin
    constant k : integer := 1;`);
    expect(statementRegionHome(source, 6)).toEqual({ region: 'process', beginLine: 5 });
  });
});

describe('architectureAbove', () => {
  test('the open architecture, by its name as written', () => {
    const source = lines(`entity e is end;
architecture RTL of e is
begin
architecture rtl2 of e is`);
    expect(architectureAbove(source, 4)).toEqual({ line: 2, name: 'RTL' });
  });

  test('an architecture already ended is not open', () => {
    const source = lines(`architecture a of e is begin end architecture;
architecture b of e is`);
    expect(architectureAbove(source, 2)).toBeUndefined();
  });

  test('an entity instantiation opens nothing', () => {
    const source = lines(`architecture a of e is
begin
  u: entity work.f port map (x => y);
  entity g is`);
    expect(architectureAbove(source, 4)).toEqual({ line: 1, name: 'a' });
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

describe('loneWord', () => {
  test.each([
    ['begisasa', { word: 'begisasa', start: 0 }],
    ['   begn   -- typo', { word: 'begn', start: 3 }],
  ])('%s', (line, expected) => {
    expect(loneWord(line)).toEqual(expected);
  });

  test.each(['', '-- only a comment', 'LED <= SW;', 'two words'])('none in %j', (line) => {
    expect(loneWord(line)).toBeUndefined();
  });
});
