// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { VhdlDeclarations } from './vhdlDeclarations';
import { assignmentOn, codeShape, namedParts, splitTopLevel, widthOf } from './vhdlExpression';

describe('assignmentOn', () => {
  test('reads target, operator and value', () => {
    expect(assignmentOn('    count <= count + 1; -- next')).toMatchObject({
      targetName: 'count',
      operator: '<=',
      value: { text: 'count + 1', start: 13, end: 22 },
    });
  });

  test('the value stops at a condition', () => {
    expect(assignmentOn("  led <= '1' when sw = 5 else '0';")?.value.text).toBe("'1'");
  });

  test('a label in front is skipped', () => {
    expect(assignmentOn('  set: y <= a;')?.targetName).toBe('y');
  });

  test('an indexed target is kept whole', () => {
    expect(assignmentOn("      v(i) := '1';")?.target.text).toBe('v(i)');
  });

  test('a comparison in an if is not an assignment', () => {
    expect(assignmentOn('    if a <= b then')).toBeUndefined();
  });

  test('a choice of a case statement is skipped', () => {
    expect(assignmentOn('      when "11" => count <= count + 1;')?.value.text).toBe('count + 1');
  });
});

describe('the code of a line', () => {
  test('a semicolon in a string is not code', () => {
    expect(codeShape('y <= "a;b"; -- c;')).toBe('y <= "___";      ');
  });

  test('a top-level split leaves parentheses alone', () => {
    expect(splitTopLevel('a & f(b & c) & d', /&/)).toEqual(['a', 'f(b & c)', 'd']);
  });

  test('named parts are found outer first', () => {
    expect(namedParts('mem(to_integer(addr))').map((part) => part.name.text)).toEqual(['mem', 'to_integer']);
  });
});

describe('widthOf', () => {
  const declarations = new VhdlDeclarations([
    'signal a : std_logic_vector(7 downto 0);',
    'signal u : unsigned(3 downto 0);',
    'signal s : std_logic;',
  ]);
  const width = (text: string) => widthOf(text, 4, declarations);

  test.each<[string, number]>([
    ['a', 8],
    ['a(5 downto 2)', 4],
    ['a(0)', 1],
    ['a & s', 9],
    ['u + 1', 4],
    ['(a & a)', 16],
    ['x"AB"', 8],
    ['o"7"', 3],
    ['"10_10"', 4],
    ["'1'", 1],
    ['std_logic_vector(u)', 4],
    ['to_unsigned(5, 12)', 12],
    ["resize(u, a'length)", 8],
  ])('%s has %d bits', (text, bits) => {
    expect(width(text)).toBe(bits);
  });

  test.each(['(others => \'0\')', 'f(a)', 'n + 1'])('%s has no certain width', (text) => {
    expect(width(text)).toBeUndefined();
  });
});
