// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { analyzeFile, type FileSymbols } from './fileSymbols';
import { linkedOccurrences } from './portLinks';

/** Selects the `nth` whole-word `name` on 0-based `line` of `from`; returns what `to` paints, as "line:kind". */
function linked(from: FileSymbols, line: number, name: string, to: FileSymbols, nth = 0): string[] {
  const match = [...from.lines[line].matchAll(new RegExp(`\\b${name}\\b`, 'g'))][nth];
  const symbol = from.index.symbolAt(line, match.index!);
  if (!symbol) throw new Error(`no symbol at ${name} on line ${line}`);
  const occurrences = linkedOccurrences(from, symbol, to);
  return [...occurrences.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([l, list]) => [...list].sort((a, b) => a.start - b.start).map((o) => `${l}:${o.kind}`));
}

describe('VHDL: testbench and design side by side', () => {
  const DESIGN = analyzeFile('and_gate.vhd', [
    'entity and_gate is', //                                    0
    '  generic (W : natural := 1);', //                         1
    '  port (a, b : in bit; y : out bit);', //                  2
    'end entity;', //                                           3
    'architecture rtl of and_gate is', //                       4
    'begin', //                                                 5
    '  y <= a and b;', //                                       6
    'end;', //                                                  7
  ].join('\n'));
  const BENCH = analyzeFile('and_gate_tb.vhd', [
    'entity and_gate_tb is end;', //                            0
    'architecture sim of and_gate_tb is', //                    1
    '  signal a, in_b, y : bit;', //                            2
    'begin', //                                                 3
    '  uut : entity work.and_gate generic map (W => 1)', //     4
    '    port map (a => a, b => in_b, y => y);', //             5
    "  a <= '1'; in_b <= a;", //                                6
    'end;', //                                                  7
  ].join('\n'));

  it('a design port lights the formal and the signal wired to it, even under the same name', () => {
    expect(linked(DESIGN, 2, 'a', BENCH)).toEqual(['2:declaration', '5:reference', '5:reference', '6:reference', '6:reference']);
  });

  it('a design port wired to a differently named signal lights that signal', () => {
    expect(linked(DESIGN, 2, 'b', BENCH)).toEqual(['2:declaration', '5:reference', '5:reference', '6:reference']);
  });

  it('a generic lights its generic map formal', () => {
    expect(linked(DESIGN, 1, 'W', BENCH)).toEqual(['4:reference']);
  });

  it('a testbench signal lights the design port it drives', () => {
    expect(linked(BENCH, 2, 'in_b', DESIGN)).toEqual(['2:declaration', '6:reference']);
    expect(linked(BENCH, 6, 'a', DESIGN)).toEqual(['2:declaration', '6:reference']);
  });

  it('a port-map formal in the testbench lights the design port it names', () => {
    expect(linked(BENCH, 5, 'b', DESIGN)).toEqual(['2:declaration', '6:reference']); // the b left of =>
    expect(linked(BENCH, 5, 'a', DESIGN, 0)).toEqual(['2:declaration', '6:reference']);
  });

  it('lights nothing for a name that is not wired', () => {
    const unwired = analyzeFile('x_tb.vhd', 'architecture s of x is signal z : bit; begin z <= z; end;');
    expect(linked(unwired, 0, 'z', DESIGN)).toEqual([]);
  });
});

describe('Verilog: testbench and design side by side', () => {
  const DESIGN = analyzeFile('and_gate.v', [
    'module and_gate #(parameter W = 1) (input a, input b, output y);', // 0
    '  assign y = a & b;', //                                             1
    'endmodule', //                                                       2
  ].join('\n'));
  const BENCH = analyzeFile('and_gate_tb.v', [
    'module and_gate_tb;', //                                             0
    '  reg a, in_b;', //                                                  1
    '  wire y;', //                                                       2
    '  and_gate #(.W(1)) uut (.a(a), .b(in_b), .y(y));', //               3
    '  initial begin a = 1; in_b = a; end', //                            4
    'endmodule', //                                                       5
  ].join('\n'));

  it('a design port lights the named connection and the signal wired to it', () => {
    expect(linked(DESIGN, 0, 'b', BENCH)).toEqual(['1:declaration', '3:reference', '3:reference', '4:reference']);
  });

  it('a parameter lights its #( ) connection', () => {
    expect(linked(DESIGN, 0, 'W', BENCH)).toEqual(['3:reference']);
  });

  it('a testbench signal lights the design port it drives', () => {
    expect(linked(BENCH, 1, 'in_b', DESIGN)).toEqual(['0:declaration', '1:reference']);
  });

  it('the .a of a named connection lights the design port a', () => {
    expect(linked(BENCH, 3, 'a', DESIGN, 0)).toEqual(['0:declaration', '1:reference']); // .a(a): the first a
  });
});

describe('only the instantiated unit links', () => {
  const DESIGN = analyzeFile('gates.v', [
    'module and_gate (input a, output y);', //                    0
    '  function f(input a); f = a; endfunction', //               1
    '  assign y = f(a);', //                                      2
    'endmodule', //                                               3
    'module or_gate (input a, output y);', //                     4
    '  assign y = a;', //                                         5
    'endmodule', //                                               6
  ].join('\n'));
  const BENCH = analyzeFile('gates_tb.v', [
    'module tb;', //                                              0
    '  reg x; wire z;', //                                        1
    '  and_gate u0 (.a(x), .y(z));', //                           2
    'endmodule', //                                               3
  ].join('\n'));

  it("a testbench signal lights and_gate's port a, not or_gate's or the function's argument a", () => {
    expect(linked(BENCH, 1, 'x', DESIGN)).toEqual(['0:declaration', '2:reference']);
  });

  it("or_gate's port a lights nothing in a testbench that only instantiates and_gate", () => {
    expect(linked(DESIGN, 4, 'a', BENCH)).toEqual([]);
  });
});

describe('a VHDL testbench and a Verilog design', () => {
  const DESIGN = analyzeFile('and_gate.v', 'module and_gate (input a, output y);\n  assign y = a;\nendmodule');
  const BENCH = analyzeFile('and_gate_tb.vhd', [
    'architecture sim of tb is', //                                       0
    '  signal x, z : bit;', //                                            1
    'begin', //                                                           2
    '  uut : entity work.AND_GATE port map (A => x, Y => z);', //         3
    'end;', //                                                            4
  ].join('\n'));

  it('match names ignoring case, as VHDL does', () => {
    expect(linked(BENCH, 1, 'x', DESIGN)).toEqual(['0:declaration', '1:reference']);
  });
});
