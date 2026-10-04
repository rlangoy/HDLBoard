// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { EXAMPLE_FILES } from './files';
import { tokenizeVerilog, VERILOG_KEYWORDS, VERILOG_TYPES } from './verilogHighlight';
import { markRanges, type Token } from './vhdlHighlight';

/** The tokens of one line, without the whitespace, as `type:text`. */
function summary(line: string): string[] {
  return tokenizeVerilog([line])[0]
    .filter((token) => token.type !== 'whitespace')
    .map((token) => `${token.type}:${token.text}`);
}

const fixtureTexts = import.meta.glob<string>('../../../tests/fixtures/verilog/*.v', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Icarus Verilog's lexor_keyword.gperf, generations 1364-1995/2001/2001-config/2005, without the deprecated `wone`. */
const ICARUS_2005_WORDS = `always and assign automatic begin buf bufif0 bufif1 case casex casez cell cmos config
deassign default defparam design disable edge else end endcase endconfig endfunction endgenerate endmodule
endprimitive endspecify endtable endtask event for force forever fork function generate genvar highz0 highz1
if ifnone incdir include initial inout input instance integer join large liblist library localparam
macromodule medium module nand negedge nmos nor noshowcancelled not notif0 notif1 or output parameter pmos
posedge primitive pull0 pull1 pulldown pullup pulsestyle_onevent pulsestyle_ondetect rcmos real realtime reg
release repeat rnmos rpmos rtran rtranif0 rtranif1 scalared showcancelled signed small specify specparam
strong0 strong1 supply0 supply1 table task time tran tranif0 tranif1 tri tri0 tri1 triand trior trireg
unsigned use uwire vectored wait wand weak0 weak1 while wire wor xnor xor`.split(/\s+/);

describe('tokenizeVerilog: numbers', () => {
  test.each(["4'b1010", "8'hFF", "'h0", "8'sd12", "4'b10xz?", "16'h_dead", '1_000', '42', '1.5e-3'])(
    '%s is one number',
    (literal) => {
      expect(summary(literal)).toEqual([`number:${literal}`]);
    },
  );

  test('two sized numbers on a line are not a string (the VHDL tokenizer paints them as one)', () => {
    expect(summary("reg [3:0] a = 4'b0000, b = 1'b1;")).toEqual([
      'type:reg', 'punctuation:[', 'number:3', 'punctuation::', 'number:0', 'punctuation:]',
      'identifier:a', 'punctuation:=', "number:4'b0000", 'punctuation:,',
      'identifier:b', 'punctuation:=', "number:1'b1", 'punctuation:;',
    ]);
  });
});

describe('tokenizeVerilog: comments', () => {
  test('a line comment runs to the end of the line, even right after a semicolon', () => {
    expect(summary('x;// count up')).toEqual(['identifier:x', 'punctuation:;', 'comment:// count up']);
  });

  test('`--` is not a comment', () => {
    expect(summary('i--;')).toEqual(['identifier:i', 'punctuation:-', 'punctuation:-', 'punctuation:;']);
  });

  test('two block comments on one line', () => {
    expect(summary('/* a */ wire w; /* b */')).toEqual([
      'comment:/* a */', 'type:wire', 'identifier:w', 'punctuation:;', 'comment:/* b */',
    ]);
  });

  test('a block comment across lines; the code after the closing mark is coloured normally', () => {
    const lines = ['wire a; /* start', '   still a comment', '   end */ wire b;', 'wire c;'];
    const tokens = tokenizeVerilog(lines);
    expect(tokens[0].map((t) => t.type)).toEqual(['type', 'whitespace', 'identifier', 'punctuation', 'whitespace', 'comment']);
    expect(tokens[1]).toEqual([{ text: '   still a comment', type: 'comment' }]);
    expect(tokens[2][0]).toEqual({ text: '   end */', type: 'comment' });
    expect(tokens[2].slice(1).filter((t) => t.type !== 'whitespace').map((t) => t.type)).toEqual(['type', 'identifier', 'punctuation']);
    expect(tokens[3].some((t) => t.type === 'comment')).toBe(false);
  });

  test('an unterminated block comment runs to the end of the file; an empty line inside it has no tokens', () => {
    expect(tokenizeVerilog(['/* never closed', '', 'wire w;']).map((line) => line.map((t) => t.type))).toEqual([
      ['comment'], [], ['comment'],
    ]);
  });
});

describe('tokenizeVerilog: words', () => {
  test('keywords, types and identifiers; Verilog is case-sensitive', () => {
    expect(summary('module m(input wire Begin);')).toEqual([
      'keyword:module', 'identifier:m', 'punctuation:(', 'keyword:input', 'type:wire', 'identifier:Begin',
      'punctuation:)', 'punctuation:;',
    ]);
  });

  test('`logic` and `bit` are not keywords at the default (1364-2005) generation', () => {
    expect(summary('logic bit')).toEqual(['identifier:logic', 'identifier:bit']);
  });

  test('system tasks, including one with a `$` inside, and directives and macro uses', () => {
    expect(summary('$display("x=%0d", n);')).toEqual([
      'system:$display', 'punctuation:(', 'string:"x=%0d"', 'punctuation:,', 'identifier:n', 'punctuation:)', 'punctuation:;',
    ]);
    expect(summary('$value$plusargs')).toEqual(['system:$value$plusargs']);
    expect(summary('`timescale 1ns/1ps')).toEqual([
      'directive:`timescale', 'number:1', 'identifier:ns', 'punctuation:/', 'number:1', 'identifier:ps',
    ]);
    expect(summary('`WIDTH')).toEqual(['directive:`WIDTH']);
  });

  test('an escaped identifier ends at whitespace', () => {
    expect(summary('\\bus[0] = 1;')).toEqual(['identifier:\\bus[0]', 'punctuation:=', 'number:1', 'punctuation:;']);
  });

  test('a string with an escaped quote; an unterminated string stops at the end of its line', () => {
    expect(summary('"a \\"q\\" b"')).toEqual(['string:"a \\"q\\" b"']);
    const tokens = tokenizeVerilog(['"unterminated', 'wire w;']);
    expect(tokens[0]).toEqual([{ text: '"unterminated', type: 'string' }]);
    expect(tokens[1].some((t) => t.type === 'string')).toBe(false);
  });

  test('a lone `$`, a lone backtick and a lone quote are kept, as punctuation', () => {
    expect(summary("$ ` '")).toEqual(['punctuation:$', 'punctuation:`', "punctuation:'"]);
  });
});

describe('tokenizeVerilog: the keyword table', () => {
  test('keywords and types together are exactly Icarus Verilog\'s 1364-2005 words, and do not overlap', () => {
    expect([...VERILOG_KEYWORDS, ...VERILOG_TYPES].sort()).toEqual([...ICARUS_2005_WORDS].sort());
    expect([...VERILOG_KEYWORDS].filter((word) => VERILOG_TYPES.has(word))).toEqual([]);
  });
});

describe('tokenizeVerilog: whole files', () => {
  const sources = [
    ...EXAMPLE_FILES.filter((file) => file.folder === 'verilog').map((file) => [file.name, file.content] as const),
    ...Object.entries(fixtureTexts).map(([path, text]) => [path.slice(path.lastIndexOf('/') + 1), text] as const),
  ];

  test('there are files to check', () => {
    expect(sources.length).toBeGreaterThanOrEqual(4);
  });

  test.each(sources)('%s: every line\'s tokens put together are the line, and none is empty', (_name, content) => {
    const lines = content.split('\n');
    const tokens = tokenizeVerilog(lines);
    expect(tokens).toHaveLength(lines.length);
    tokens.forEach((line, i) => {
      expect(line.map((t) => t.text).join('')).toBe(lines[i]);
      expect(line.every((t) => t.text.length > 0)).toBe(true);
    });
  });

  test('a Windows line end is kept, as whitespace', () => {
    const tokens = tokenizeVerilog(['wire w;\r'])[0];
    expect(tokens[tokens.length - 1]).toEqual({ text: '\r', type: 'whitespace' });
  });

  test('no input, and an empty line', () => {
    expect(tokenizeVerilog([])).toEqual([]);
    expect(tokenizeVerilog([''])).toEqual([[]]);
  });
});

describe('tokenizeVerilog with markRanges', () => {
  test('a mark inside a Verilog token splits it, and each piece keeps its type', () => {
    const tokens: Token[] = tokenizeVerilog(["4'b1010"])[0];
    expect(markRanges(tokens, [{ start: 2, end: 4 }])).toEqual([
      { text: "4'", type: 'number', marked: false },
      { text: 'b1', type: 'number', marked: true },
      { text: '010', type: 'number', marked: false },
    ]);
  });
});
