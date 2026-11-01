// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { insertBegin } from './beginFix';
import { applyInsertion } from './useClauseFix';

function fixed(content: string, line: number): string | undefined {
  const insertion = insertBegin(content, line);
  return insertion && applyInsertion(content, insertion);
}

describe('insertBegin', () => {
  const SOURCE = `architecture rtl of e is

    -- LEDR <= SW; the first thing every student wires up.
    LED <= SW;
end architecture;`;

  test('goes above the comments that belong to the statement, indented like the header', () => {
    expect(fixed(SOURCE, 4)).toBe(`architecture rtl of e is

begin
    -- LEDR <= SW; the first thing every student wires up.
    LED <= SW;
end architecture;`);
  });

  test('the caret ends up just after the new begin', () => {
    const startOfLine3 = 'architecture rtl of e is\n\n'.length;
    expect(insertBegin(SOURCE, 4)?.caret).toBe(startOfLine3 + 'begin'.length);
  });

  test('keeps the file’s CRLF line endings', () => {
    expect(fixed(SOURCE.replace(/\n/g, '\r\n'), 4)).toContain('\r\nbegin\r\n    -- LEDR');
  });

  test('right above the statement when no comment is there, below the declarations', () => {
    const source = '  architecture a of e is\n    signal s : bit;\n    s <= x;\n  end;';
    expect(fixed(source, 3)).toBe('  architecture a of e is\n    signal s : bit;\n  begin\n    s <= x;\n  end;');
  });

  test('nothing when the architecture has a begin already', () => {
    expect(insertBegin('architecture a of e is\nbegin\n  s <= x;\nend;', 3)).toBeUndefined();
  });
});
