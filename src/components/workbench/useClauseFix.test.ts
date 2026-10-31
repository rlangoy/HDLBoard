// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { ADDER_LINE, starterWithAdder } from './quickFix.testSupport';
import { addUseClause, applyInsertion, clashingPackageInUse } from './useClauseFix';
import { packageDeclaring, type VhdlPackage } from './vhdlPackages';

const NUMERIC_STD: VhdlPackage = { library: 'ieee', name: 'numeric_std' };
const TEXTIO: VhdlPackage = { library: 'std', name: 'textio' };

function lineOf(content: string, text: string): number {
  return content.split('\n').findIndex((line) => line.includes(text)) + 1;
}

/** The file after the fix for the code on the line holding `at`. */
function fixed(content: string, at: string, pkg = NUMERIC_STD): string | undefined {
  const insertion = addUseClause(content, pkg, lineOf(content, at));
  return insertion && applyInsertion(content, insertion);
}

describe('packageDeclaring', () => {
  test.each([
    ['unsigned', 'numeric_std'],
    ['to_integer', 'numeric_std'],
    ['RESIZE', 'numeric_std'],
    ['std_logic', 'std_logic_1164'],
    ['rising_edge', 'std_logic_1164'],
    ['ceil', 'math_real'],
    ['readline', 'textio'],
  ])('%s is declared in %s', (name, pkg) => {
    expect(packageDeclaring(name)?.name).toBe(pkg);
  });

  test('a name of the student\'s own is in no package', () => {
    expect(packageDeclaring('counter')).toBeUndefined();
  });
});

describe('addUseClause', () => {
  test('the bug report: adds `use ieee.numeric_std.all;` right below the use clause already there', () => {
    const content = starterWithAdder();
    expect(fixed(content, ADDER_LINE)?.split('\n').slice(0, 4)).toEqual([
      'library ieee;',
      'use ieee.std_logic_1164.all;',
      'use ieee.numeric_std.all;',
      '',
    ]);
  });

  test('changes nothing else in the file', () => {
    const content = starterWithAdder();
    expect(fixed(content, ADDER_LINE)?.replace('use ieee.numeric_std.all;\n', '')).toBe(content);
  });

  test('puts the caret at the end of the new line', () => {
    const content = starterWithAdder();
    const insertion = addUseClause(content, NUMERIC_STD, lineOf(content, ADDER_LINE));
    const after = insertion && applyInsertion(content, insertion);
    expect(after?.slice(0, insertion?.caret).endsWith('use ieee.numeric_std.all;')).toBe(true);
  });

  test('offers nothing when the package is used already (in any case)', () => {
    const content = 'library IEEE;\nuse IEEE.Numeric_Std.ALL;\narchitecture a of e is begin\n  q <= unsigned(d);\nend;';
    expect(addUseClause(content, NUMERIC_STD, 4)).toBeUndefined();
  });

  test('a use clause only in a comment does not count', () => {
    const content = 'library ieee;\n-- use ieee.numeric_std.all;\narchitecture a of e is begin\n  q <= unsigned(d);\nend;';
    expect(fixed(content, 'q <=')).toBe(
      'library ieee;\nuse ieee.numeric_std.all;\n-- use ieee.numeric_std.all;\narchitecture a of e is begin\n  q <= unsigned(d);\nend;',
    );
  });

  test('adds `library ieee;` too when the file has no library clause', () => {
    const content = 'use work.defs.all;\nentity e is end;\narchitecture a of e is begin\n  q <= unsigned(d);\nend;';
    expect(fixed(content, 'q <=')).toBe(
      'use work.defs.all;\nlibrary ieee;\nuse ieee.numeric_std.all;\nentity e is end;\narchitecture a of e is begin\n  q <= unsigned(d);\nend;',
    );
  });

  test('a file without any clause gets both at the top, after its header comment', () => {
    const content = '-- My adder\n\nentity e is end;\narchitecture a of e is begin\n  q <= unsigned(d);\nend;';
    expect(fixed(content, 'q <=')).toBe(
      '-- My adder\n\nlibrary ieee;\nuse ieee.numeric_std.all;\n\nentity e is end;\narchitecture a of e is begin\n  q <= unsigned(d);\nend;',
    );
  });

  test('std.textio needs no library clause: std is always visible', () => {
    const content = 'entity tb is end;\narchitecture a of tb is begin\n  readline(input, l);\nend;';
    expect(fixed(content, 'readline', TEXTIO)?.split('\n')[0]).toBe('use std.textio.all;');
  });

  test('several clauses on one line are read, and the new one goes below that line', () => {
    const content = 'library ieee; use ieee.std_logic_1164.all;\nentity e is end;\narchitecture a of e is begin q <= unsigned(d); end;';
    expect(fixed(content, 'q <=')).toBe(
      'library ieee; use ieee.std_logic_1164.all;\nuse ieee.numeric_std.all;\nentity e is end;\narchitecture a of e is begin q <= unsigned(d); end;',
    );
  });

  test('takes the indentation of the clause above', () => {
    const content = '  library ieee;\n  use ieee.std_logic_1164.all;\nentity e is end;\narchitecture a of e is begin q <= unsigned(d); end;';
    expect(fixed(content, 'q <=')?.split('\n')[2]).toBe('  use ieee.numeric_std.all;');
  });

  test('keeps Windows line endings', () => {
    const content = 'library ieee;\r\nuse ieee.std_logic_1164.all;\r\narchitecture a of e is begin\r\n  q <= unsigned(d);\r\nend;\r\n';
    expect(fixed(content, 'q <=')).toBe(
      'library ieee;\r\nuse ieee.std_logic_1164.all;\r\nuse ieee.numeric_std.all;\r\narchitecture a of e is begin\r\n  q <= unsigned(d);\r\nend;\r\n',
    );
  });

  test('only clauses above the error count: a second design unit has its own', () => {
    const content = [
      'library ieee;',
      'use ieee.std_logic_1164.all;',
      'entity a is end;',
      'architecture rtl of a is begin q <= unsigned(d); end;',
      'library ieee;',
      'use ieee.numeric_std.all;',
      'entity b is end;',
    ].join('\n');
    expect(fixed(content, 'q <=')?.split('\n').slice(0, 3)).toEqual([
      'library ieee;',
      'use ieee.std_logic_1164.all;',
      'use ieee.numeric_std.all;',
    ]);
  });

  test('offers nothing when the file uses std_logic_arith, which clashes with numeric_std', () => {
    const content = 'library ieee;\nuse ieee.std_logic_arith.all;\narchitecture a of e is begin\n  q <= to_unsigned(d, 4);\nend;';
    expect(addUseClause(content, NUMERIC_STD, 4)).toBeUndefined();
    expect(clashingPackageInUse(content, NUMERIC_STD, 4)?.name).toBe('std_logic_arith');
  });
});
