// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { EXAMPLE_FILES } from './files';
import { tokenizeSource } from './highlight';
import { tokenizeVerilog } from './verilogHighlight';
import { tokenizeVhdlLine } from './vhdlHighlight';

const vhdlFixtures = import.meta.glob<string>('../../../tests/fixtures/vhdl/*.vhdl', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Every VHDL file we have: the starters and the fixtures. */
const VHDL_SOURCES = [
  ...EXAMPLE_FILES.filter((file) => file.folder !== 'verilog').map((file) => [file.name, file.content] as const),
  ...Object.entries(vhdlFixtures).map(([path, text]) => [path.slice(path.lastIndexOf('/') + 1), text] as const),
];

describe('tokenizeSource keeps VHDL colouring exactly as it was', () => {
  test('there are files to check', () => {
    expect(VHDL_SOURCES.length).toBeGreaterThanOrEqual(6);
  });

  test.each(VHDL_SOURCES)('%s: VHDL and no language both equal tokenizeVhdlLine line by line', (_name, content) => {
    const lines = content.split('\n');
    const expected = lines.map((line) => tokenizeVhdlLine(line));
    expect(tokenizeSource('vhdl', lines)).toEqual(expected);
    expect(tokenizeSource(undefined, lines)).toEqual(expected);
  });

  test('VHDL still treats `--` as a comment and does not see a Verilog comment', () => {
    const tokens = tokenizeSource('vhdl', ['a <= b; -- c'])[0];
    expect(tokens[tokens.length - 1]).toEqual({ text: '-- c', type: 'comment' });
    expect(tokenizeSource('vhdl', ['// c'])[0].some((token) => token.type === 'comment')).toBe(false);
  });
});

describe('tokenizeSource for Verilog', () => {
  test('uses the Verilog tokenizer', () => {
    const lines = ['/* a', 'b */ wire w; // c'];
    expect(tokenizeSource('verilog', lines)).toEqual(tokenizeVerilog(lines));
  });
});
