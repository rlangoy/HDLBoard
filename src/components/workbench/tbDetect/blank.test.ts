// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { blankSource } from './blank';
import { FIXTURES } from './fixtures.testSupport';

/** docs/impl_split_screen.md § 5.2. */

const vhdl = (src: string) => blankSource('vhdl', src).code;
const vlog = (src: string) => blankSource('verilog', src).code;

describe('blankSource keeps the shape of the source', () => {
  test.each([...FIXTURES])('%s: same length, same newlines', (path, text) => {
    const code = blankSource(path.startsWith('vhdl') ? 'vhdl' : 'verilog', text).code;
    expect(code.length).toBe(text.length);
    expect([...code.matchAll(/\n/g)].map((m) => m.index)).toEqual([...text.matchAll(/\n/g)].map((m) => m.index));
  });
});

describe('VHDL', () => {
  test.each([
    ['a line comment', 'x <= y; -- wait for 1 ns;', 'x <= y;'],
    ['a block comment over lines', 'a /* wait\nfor */ b', 'a b'],
    ['a string', 'report "wait for";', 'report'],
    ['a string with a doubled quote', 'report "a""wait for";', 'report'],
    ['a character literal', "x <= '1';", 'x <='],
  ])('blanks %s', (_name, src, kept) => {
    const code = vhdl(src);
    expect(code.replace(/\s+/g, ' ').trim().replace(/;$/, '').trim()).toBe(kept.replace(/;$/, ''));
  });

  test("keeps attribute ticks: clk'event and clk = '1'", () => {
    expect(vhdl("if clk'event and clk = '1' then")).toBe("if clk'event and clk =     then");
  });

  test("keeps a qualified expression: unsigned'(x)", () => {
    expect(vhdl("y <= unsigned'(\"01\");")).toBe("y <= unsigned'(    );");
  });

  test('records a translate_off region by lines', () => {
    const src = 'a;\n-- synthesis translate_off\nb;\n-- synthesis translate_on\nc;';
    expect(blankSource('vhdl', src).simOnlyRegions).toEqual([{ start: 2, end: 4 }]);
  });

  test('an unclosed translate_off runs to the end of the file', () => {
    expect(blankSource('vhdl', 'a;\n-- pragma translate_off\nb;\nc;').simOnlyRegions).toEqual([{ start: 2, end: 4 }]);
  });
});

describe('Verilog', () => {
  test.each([
    ['a line comment', 'a; // #10 $finish;'],
    ['a block comment', 'a; /* always #5 clk = ~clk; */'],
    ['a string with an escaped quote', 'a; $x("\\" #5");'],
    ['an attribute', 'a; (* keep = "#5" *)'],
  ])('blanks %s', (_name, src) => {
    expect(vlog(src)).not.toMatch(/#/);
  });

  test('keeps @(*) as code', () => {
    expect(vlog('always @(*) y = a;')).toBe('always @(*) y = a;');
  });

  test('blanks an inactive `ifdef branch and keeps the active `else', () => {
    const code = vlog('`ifdef NEVER\ninitial $finish;\n`else\nassign y = a;\n`endif');
    expect(code).not.toMatch(/\$finish/);
    expect(code).toMatch(/assign y = a;/);
  });

  test('a `define makes its `ifdef active', () => {
    expect(vlog('`define SIM\n`ifdef SIM\ninitial $finish;\n`endif')).toMatch(/\$finish/);
  });

  test('nested `ifdef inside an inactive branch stays inactive', () => {
    const code = vlog('`define A\n`ifdef B\n`ifdef A\nx1;\n`else\nx2;\n`endif\n`endif\nx3;');
    expect(code).not.toMatch(/x1|x2/);
    expect(code).toMatch(/x3/);
  });

  test('`elsif takes the first branch that holds', () => {
    const code = vlog('`define B\n`ifdef A\nx1;\n`elsif B\nx2;\n`else\nx3;\n`endif');
    expect(code).toMatch(/x2/);
    expect(code).not.toMatch(/x1|x3/);
  });

  test('an active `ifndef SYNTHESIS branch is a sim-only region', () => {
    expect(blankSource('verilog', 'a;\n`ifndef SYNTHESIS\nb;\n`endif\nc;').simOnlyRegions).toEqual([{ start: 2, end: 4 }]);
  });

  test('a `// synthesis translate_off` pragma is a sim-only region', () => {
    const src = '// synthesis translate_off\nb;\n// synthesis translate_on';
    expect(blankSource('verilog', src).simOnlyRegions).toEqual([{ start: 1, end: 3 }]);
  });

  test("a number's tick stays code", () => {
    expect(vlog("q <= 8'd10;")).toBe("q <= 8'd10;");
  });
});
