// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { holdsDeclarations, regionsIn, type Region } from './vhdlScopes';

/** The blocks of `lines` as `kind first-last`, by 1-based line. */
function blocks(lines: readonly string[]): string[] {
  const code = lines.join('\n');
  const lineOf = (offset: number) => code.slice(0, offset).split('\n').length;
  const text = (r: Region) => `${r.kind} ${lineOf(r.start)}-${lineOf(r.end)}`;
  return regionsIn(lines).map(text).sort();
}

describe('regionsIn', () => {
  test('a process ends at its end process', () => {
    expect(blocks(['p: process', 'begin', '  wait;', 'end process;', 'x <= y;'])).toEqual(['process 1-4']);
  });

  test('nested loops end at their own end loop', () => {
    expect(blocks(['for i in 0 to 1 loop', '  for j in 0 to 1 loop', '  end loop;', 'end loop;'])).toEqual(['loop 1-4', 'loop 2-3']);
  });

  test('a subprogram body ends past the end ifs in it', () => {
    expect(blocks(['function f(n : integer) return integer is', 'begin', '  if n > 0 then return n; end if;', '  return 0;', 'end function;'])).toEqual([
      'subprogram 1-5',
    ]);
  });

  test('a subprogram declaration without a body ends at its ;', () => {
    expect(blocks(['function f(n : integer) return integer;', 'signal s : bit;'])).toEqual(['subprogram 1-1']);
  });

  test('a body nested in a body ends first', () => {
    const nested = ['procedure outer is', '  procedure inner is', '  begin', '  end;', 'begin', '  inner;', 'end procedure;'];
    expect(blocks(nested)).toEqual(['subprogram 1-7', 'subprogram 2-4']);
  });

  test('end function names no new function', () => {
    expect(blocks(['function f return bit is', 'begin', '  return 0;', 'end function f;'])).toEqual(['subprogram 1-4']);
  });

  test('words inside a string end nothing', () => {
    expect(blocks(['p: process', 'begin', '  report "end process; end;";', 'end process;'])).toEqual(['process 1-4']);
  });

  test('words inside a comment end nothing', () => {
    expect(blocks(['p: process', 'begin', '  -- end process;', 'end process;'])).toEqual(['process 1-4']);
  });

  test('a block left open reaches the end of the file', () => {
    expect(blocks(['p: process', 'begin'])).toEqual(['process 1-2']);
  });
});

describe('holdsDeclarations', () => {
  test('a process holds declarations', () => {
    expect(holdsDeclarations({ kind: 'process', start: 0, end: 1 })).toBe(true);
  });

  test('a loop declares only its parameter', () => {
    expect(holdsDeclarations({ kind: 'loop', start: 0, end: 1 })).toBe(false);
  });
});
