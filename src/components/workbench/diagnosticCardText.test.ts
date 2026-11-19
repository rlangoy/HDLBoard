// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { copyableText, textBlocks } from './diagnosticCardText';

const BODY = [
  'Allowed: one clock edge, plus an optional asynchronous reset or set tested as a level before it:',
  "  if rst = '0' then             -- reset or set: optional, a level",
  '  elsif rising_edge(clk) then   -- the one clock edge, last',
  'Here: `KEY(1)` is one clock, `KEY(0)` a second clock → error.',
].join('\n');

describe('the problem card splits a message into prose and code', () => {
  test('lines indented by two spaces are one code block, without the indent', () => {
    expect(textBlocks(BODY)).toEqual([
      { kind: 'text', lines: ['Allowed: one clock edge, plus an optional asynchronous reset or set tested as a level before it:'] },
      { kind: 'code', lines: ["if rst = '0' then             -- reset or set: optional, a level", 'elsif rising_edge(clk) then   -- the one clock edge, last'] },
      { kind: 'text', lines: ['Here: `KEY(1)` is one clock, `KEY(0)` a second clock → error.'] },
    ]);
  });

  test('a one-line compiler message is one prose block', () => {
    expect(textBlocks("'then' is expected")).toEqual([{ kind: 'text', lines: ["'then' is expected"] }]);
  });
});

describe('Copy puts where, the line itself and the message on the clipboard', () => {
  test('as plain text, ready to paste', () => {
    expect(copyableText({ fileName: 'keyCouter2Led.vhdl', line: 23 }, '        elsif falling_edge(KEY(0)) then   ', 'warning: `count` uses two clocks')).toBe(
      ['keyCouter2Led.vhdl, line 23', '23 |         elsif falling_edge(KEY(0)) then', '', 'warning: `count` uses two clocks'].join('\n'),
    );
  });

  test('an empty line is left out', () => {
    expect(copyableText({ fileName: 'a.vhd', line: 3 }, '   ', 'error: x')).toBe('a.vhd, line 3\n\nerror: x');
  });
});
