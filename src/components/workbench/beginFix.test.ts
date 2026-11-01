// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { insertBegin, loneWord, replaceWithBegin } from './beginFix';
import { applyTextEdit } from './textLines';

function fixed(content: string, line: number): string | undefined {
  const insertion = insertBegin(content, line);
  return insertion && applyTextEdit(content, insertion);
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

describe('replaceWithBegin', () => {
  const SOURCE = 'architecture rtl of e is\n  begisasa  -- oops\n    LED <= SW;\nend architecture;';

  test('puts begin in place of the word, keeping its indent and comment', () => {
    const edit = replaceWithBegin(SOURCE, 2);
    expect(edit && applyTextEdit(SOURCE, edit)).toBe('architecture rtl of e is\n  begin  -- oops\n    LED <= SW;\nend architecture;');
  });

  test('the caret ends up just after the new begin', () => {
    expect(replaceWithBegin(SOURCE, 2)?.caret).toBe('architecture rtl of e is\n  begin'.length);
  });

  test('nothing when the line holds more than one word', () => {
    expect(replaceWithBegin('architecture rtl of e is\n  begisasa x\nend;', 2)).toBeUndefined();
  });

  test('nothing when the architecture has a begin already', () => {
    expect(replaceWithBegin('architecture rtl of e is\nbegin\n  begisasa\nend;', 3)).toBeUndefined();
  });
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
