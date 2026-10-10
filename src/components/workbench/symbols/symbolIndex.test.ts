// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import type { Language } from '../fileKinds';
import { tokenizeSource } from '../highlight';
import { occurrencesByLine } from './occurrences';
import { buildSymbolIndex } from './symbolIndex';

/**
 * Hovers the `nth` (0-based) `word` on `line` (0-based) and returns what would be
 * painted, as "line:kind" in file order — e.g. ["1:declaration", "8:reference"].
 * An empty list means nothing is highlighted.
 */
function hover(language: Language, source: string, line: number, word: string, nth = 0): string[] {
  const lines = source.split('\n');
  const index = buildSymbolIndex(language, tokenizeSource(language, lines));
  let offset = -1;
  for (let k = 0; k <= nth; k++) offset = lines[line].indexOf(word, offset + 1);
  if (offset < 0) throw new Error(`"${word}" #${nth} not on line ${line}: ${lines[line]}`);
  const byLine = occurrencesByLine(index.symbolAt(line, offset));
  return [...byLine.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([l, list]) => [...list].sort((a, b) => a.start - b.start).map((o) => `${l}:${o.kind}`));
}

const vhdl = (source: string, line: number, word: string, nth = 0) => hover('vhdl', source, line, word, nth);
const verilog = (source: string, line: number, word: string, nth = 0) => hover('verilog', source, line, word, nth);

describe('VHDL', () => {
  // The spec's shadowing example, inside an architecture.
  const SHADOWING = [
    'architecture rtl of e is', //       0
    '  signal data : std_logic;', //     1
    'begin', //                          2
    '  process', //                      3
    '    variable data : std_logic;', // 4
    '  begin', //                        5
    "    data := '1';", //               6
    '  end process;', //                 7
    "  data <= '0';", //                 8
    'end architecture;', //              9
  ].join('\n');

  it('hovering the inner variable highlights only the variable', () => {
    expect(vhdl(SHADOWING, 6, 'data')).toEqual(['4:declaration', '6:reference']);
    expect(vhdl(SHADOWING, 4, 'data')).toEqual(['4:declaration', '6:reference']);
  });

  it('hovering the outer signal highlights only the signal', () => {
    expect(vhdl(SHADOWING, 8, 'data')).toEqual(['1:declaration', '8:reference']);
    expect(vhdl(SHADOWING, 1, 'data')).toEqual(['1:declaration', '8:reference']);
  });

  it('works for the bare snippet from the spec too', () => {
    const bare = [
      'signal data : std_logic;',
      'process',
      '    variable data : std_logic;',
      'begin',
      "    data := '1';",
      'end process;',
      "data <= '0';",
    ].join('\n');
    expect(vhdl(bare, 4, 'data')).toEqual(['2:declaration', '4:reference']);
    expect(vhdl(bare, 6, 'data')).toEqual(['0:declaration', '6:reference']);
  });

  const COUNTER = [
    'library ieee;', //                                                    0
    'use ieee.std_logic_1164.all;', //                                     1
    'entity counter is', //                                                2
    '  generic (N : integer := 4);', //                                    3
    '  port (clk : in std_logic;', //                                      4
    '        q   : out std_logic_vector(N-1 downto 0));', //               5
    'end entity;', //                                                      6
    'architecture rtl of counter is', //                                   7
    '  signal cnt : unsigned(N-1 downto 0); -- clk comment', //            8
    'begin', //                                                            9
    '  tick : process (CLK)', //                                           10
    '  begin', //                                                          11
    '    if rising_edge(clk) then cnt <= cnt + 1; end if;', //             12
    '  end process tick;', //                                              13
    '  q <= std_logic_vector(cnt);', //                                    14
    'end architecture rtl;', //                                            15
  ].join('\n');

  it('links entity ports to their use in the architecture, ignoring case', () => {
    expect(vhdl(COUNTER, 12, 'clk')).toEqual(['4:declaration', '10:reference', '12:reference']);
    expect(vhdl(COUNTER, 14, 'q')).toEqual(['5:declaration', '14:reference']);
  });

  it('links generics', () => {
    expect(vhdl(COUNTER, 3, 'N')).toEqual(['3:declaration', '5:reference', '8:reference']);
  });

  it('highlights signals with every use', () => {
    expect(vhdl(COUNTER, 8, 'cnt')).toEqual(['8:declaration', '12:reference', '12:reference', '14:reference']);
  });

  it("finds both uses in clk'event and clk = '1'", () => {
    const source = "entity e is port (clk : in bit); end;\narchitecture a of e is begin\nprocess begin if clk'event and clk = '1' then end if; end process;\nend;";
    expect(vhdl(source, 0, 'clk')).toEqual(['0:declaration', '2:reference', '2:reference']);
  });

  // Each of these used to leave a scope open, so a second architecture saw the first one's signals.
  const SECOND_ARCHITECTURE = 'architecture b of e is begin y <= s; end;';

  it('a configuration specification names an entity without opening a scope', () => {
    const source = [
      'architecture a of e is', //                                0
      '  signal s : bit;', //                                     1
      '  for all : c use entity work.c;', //                      2
      'begin end;', //                                            3
      SECOND_ARCHITECTURE, //                                     4
    ].join('\n');
    expect(vhdl(source, 1, 's ')).toEqual(['1:declaration']);
  });

  it('elsif and else generate branches share one generate scope', () => {
    const source = [
      'architecture a of e is', //                                0
      '  signal s : bit;', //                                     1
      'begin', //                                                 2
      '  g: if c1 generate y <= s;', //                           3
      '  elsif c2 generate y <= s;', //                           4
      '  else generate y <= s;', //                               5
      '  end generate;', //                                       6
      'end;', //                                                  7
      SECOND_ARCHITECTURE, //                                     8
    ].join('\n');
    expect(vhdl(source, 1, 's ')).toEqual(['1:declaration', '3:reference', '4:reference', '5:reference']);
  });

  it('does not take an indexed formal or a named call argument for a use', () => {
    const source = [
      'architecture a of e is', //                                           0
      '  signal q, s : bit_vector(1 downto 0);', //                          1
      'begin', //                                                            2
      '  u0 : entity work.r port map (q(0) => s(0), d => q(1));', //         3
      '  s <= f(q => s);', //                                                4
      'end;', //                                                             5
    ].join('\n');
    expect(vhdl(source, 1, 'q')).toEqual(['1:declaration', '3:reference']); // only the actual q(1)
  });

  it("keeps a qualified expression's brackets balanced", () => {
    const source = [
      'architecture a of e is', //                                           0
      '  signal s : std_logic;', //                                          1
      'begin', //                                                            2
      "  u0 : entity work.r port map (d => std_logic'('1'), q => s);", //    3
      'end;', //                                                             4
    ].join('\n');
    expect(vhdl(source, 1, 's ')).toEqual(['1:declaration', '3:reference']);
  });

  it('counts the object of an attribute specification as a use, not a label', () => {
    const source = [
      'architecture a of e is', //                                           0
      '  signal data_reg : bit;', //                                         1
      '  attribute keep of data_reg : signal is true;', //                   2
      'begin end;', //                                                       3
    ].join('\n');
    expect(vhdl(source, 1, 'data_reg')).toEqual(['1:declaration', '2:reference']);
  });

  it("does not take an attribute name for a use: cnt'high next to a constant high", () => {
    const source = [
      'architecture a of e is', //                              0
      '  constant high : integer := 7;', //                     1
      '  signal cnt : bit_vector(high downto 0);', //           2
      'begin', //                                               3
      "  x <= cnt'high;", //                                    4
      'end;', //                                                5
    ].join('\n');
    expect(vhdl(source, 1, 'high')).toEqual(['1:declaration', '2:reference']);
  });

  it('gives a for loop parameter its own scope, apart from a signal of the same name', () => {
    const source = [
      'architecture a of e is', //                              0
      '  signal i : integer;', //                               1
      'begin', //                                               2
      '  process begin', //                                     3
      '    for i in 0 to 3 loop q(i) <= d(i); end loop;', //    4
      '    i <= 1;', //                                         5
      '  end process;', //                                      6
      'end;', //                                                7
    ].join('\n');
    expect(vhdl(source, 1, 'i ')).toEqual(['1:declaration', '5:reference']);
    expect(vhdl(source, 4, 'i ')).toEqual(['4:declaration', '4:reference', '4:reference']);
  });

  it('gives a for generate parameter its own scope, and a VHDL-2008 body end keeps the generate open', () => {
    const source = [
      'architecture a of e is', //                              0
      '  signal s : bit;', //                                   1
      'begin', //                                               2
      '  g: for k in 0 to 3 generate', //                       3
      '    signal t : bit;', //                                 4
      '  begin', //                                             5
      '    t <= q(k);', //                                      6
      '  end;', //                                              7
      '  end generate;', //                                     8
      '  s <= q(0);', //                                        9
      'end;', //                                                10
      'architecture b of e is begin y <= s; end;', //          11
    ].join('\n');
    expect(vhdl(source, 3, 'k ')).toEqual(['3:declaration', '6:reference']);
    expect(vhdl(source, 1, 's ')).toEqual(['1:declaration', '9:reference']); // not architecture b's s
  });

  it('counts an enumeration literal used as an aggregate choice', () => {
    const source = [
      'architecture a of e is', //                                        0
      '  type state_t is (IDLE, RUN);', //                                1
      '  constant T : arr_t := (IDLE => 1, RUN => 2);', //               2
      'begin end;', //                                                    3
    ].join('\n');
    expect(vhdl(source, 1, 'IDLE')).toEqual(['1:declaration', '2:reference']);
  });

  it('a package body sees its package', () => {
    const source = [
      'package p is', //                                          0
      '  constant N : integer := 8;', //                          1
      'end package;', //                                          2
      'package body p is', //                                     3
      '  function f return integer is begin return N; end;', //   4
      'end package body;', //                                     5
    ].join('\n');
    expect(vhdl(source, 1, 'N')).toEqual(['1:declaration', '4:reference']);
  });

  it('ignores comments, keywords, labels and unknown names', () => {
    expect(vhdl(COUNTER, 8, 'clk')).toEqual([]); // in the comment
    expect(vhdl(COUNTER, 12, 'then')).toEqual([]);
    expect(vhdl(COUNTER, 10, 'tick')).toEqual([]);
    expect(vhdl(COUNTER, 13, 'tick')).toEqual([]);
    expect(vhdl('architecture a of e is\nsignal x : bit;\nbegin\ny <= x;\nend;', 3, 'y')).toEqual([]);
  });

  it('keeps the ports of two entities in one file apart', () => {
    const two = [
      'entity a is port (clk : in bit); end entity;', //   0
      'architecture r of a is begin end architecture;', // 1
      'entity b is port (clk : in bit); end entity;', //   2
      'architecture r of b is', //                         3
      'begin', //                                          4
      '  x <= clk;', //                                    5
      'end architecture;', //                              6
    ].join('\n');
    expect(vhdl(two, 5, 'clk')).toEqual(['2:declaration', '5:reference']);
  });

  it('declares every name of a list', () => {
    const source = 'architecture r of e is\nsignal a, b : bit;\nbegin\nb <= a;\nend;';
    expect(vhdl(source, 3, 'a')).toEqual(['1:declaration', '3:reference']);
    expect(vhdl(source, 3, 'b')).toEqual(['1:declaration', '3:reference']);
  });

  it('keeps a port-map formal apart from the actual; selecting the formal shows the formal', () => {
    const tb = [
      'architecture sim of tb is', //                                         0
      '  signal clk : std_logic;', //                                         1
      'begin', //                                                             2
      '  u0 : entity work.counter port map (clk => clk, q => open);', //       3
      'end architecture;', //                                                 4
    ].join('\n');
    expect(vhdl(tb, 3, 'clk', 1)).toEqual(['1:declaration', '3:reference']);
    expect(vhdl(tb, 3, 'clk', 0)).toEqual(['3:declaration']);
    expect(vhdl(tb, 3, 'counter')).toEqual([]);
  });

  it('links enumeration literals and types', () => {
    const fsm = [
      'architecture r of e is', //                         0
      '  type state_t is (IDLE, RUN);', //                 1
      '  signal state : state_t := IDLE;', //              2
      'begin', //                                          3
      '  process (state) begin', //                        4
      '    case state is', //                              5
      '      when IDLE => state <= RUN;', //               6
      '      when others => null;', //                     7
      '    end case;', //                                  8
      '  end process;', //                                 9
      'end architecture;', //                              10
    ].join('\n');
    expect(vhdl(fsm, 6, 'IDLE')).toEqual(['1:declaration', '2:reference', '6:reference']);
    expect(vhdl(fsm, 2, 'state_t')).toEqual(['1:declaration', '2:reference']);
  });

  it('scopes function parameters to the function', () => {
    const source = [
      'architecture r of e is', //                                            0
      '  signal x : unsigned(3 downto 0);', //                                1
      '  function inc (x : unsigned) return unsigned is', //                  2
      '  begin', //                                                           3
      '    return x + 1;', //                                                 4
      '  end function;', //                                                   5
      'begin', //                                                             6
      '  x <= inc(x);', //                                                    7
      'end architecture;', //                                                 8
    ].join('\n');
    expect(vhdl(source, 4, 'x')).toEqual(['2:declaration', '4:reference']);
    expect(vhdl(source, 7, 'x')).toEqual(['1:declaration', '7:reference', '7:reference']);
  });

  it('closes a function declared without a body at its semicolon', () => {
    const pkg = [
      'package p is', //                                           0
      '  function f (a : bit) return bit;', //                     1
      '  constant K : integer := 3;', //                           2
      'end package;', //                                           3
      'architecture r of e is', //                                 4
      '  signal a : bit;', //                                      5
      'begin', //                                                  6
      '  a <= a;', //                                              7
      'end;', //                                                   8
    ].join('\n');
    expect(vhdl(pkg, 7, 'a')).toEqual(['5:declaration', '7:reference', '7:reference']);
    expect(vhdl(pkg, 1, 'a')).toEqual(['1:declaration']);
  });

  it('does not take record fields or selected names for references', () => {
    const source = [
      'architecture r of e is', //                                      0
      '  signal a : bit;', //                                           1
      '  type rec_t is record a : bit; end record;', //                 2
      '  signal r : rec_t;', //                                         3
      'begin', //                                                       4
      '  a <= r.a;', //                                                 5
      'end;', //                                                        6
    ].join('\n');
    expect(vhdl(source, 5, 'a')).toEqual(['1:declaration', '5:reference']);
    expect(vhdl(source, 2, 'a')).toEqual([]);
  });

  it('builds a large file fast', () => {
    const body = Array.from({ length: 1500 }, (_, k) => `  s${k % 50} <= s${(k + 1) % 50} and clk;`);
    const decls = Array.from({ length: 50 }, (_, k) => `  signal s${k} : std_logic;`);
    const source = ['entity big is port (clk : in std_logic); end;', 'architecture r of big is', ...decls, 'begin', ...body, 'end;'].join('\n');
    const lines = source.split('\n');
    const started = performance.now();
    const index = buildSymbolIndex('vhdl', tokenizeSource('vhdl', lines));
    expect(performance.now() - started).toBeLessThan(250);
    expect(index.symbolAt(0, lines[0].indexOf('clk'))?.references).toHaveLength(1500);
  });
});

describe('Verilog', () => {
  // The spec's shadowing example.
  const SHADOWING = [
    'module m;', //              0
    'wire valid;', //            1
    'always @(*) begin', //      2
    '    reg valid;', //         3
    "    valid = 1'b1;", //      4
    'end', //                    5
    "assign valid = 1'b0;", //   6
    'endmodule', //              7
  ].join('\n');

  it('declares a function in its module, so a call outside it resolves', () => {
    const source = [
      'module m #(parameter N = 8);', //                0
      '  function integer clog2;', //                  1
      '    input integer v;', //                        2
      '    clog2 = v;', //                              3
      '  endfunction', //                               4
      '  localparam W = clog2(N);', //                  5
      'endmodule', //                                   6
    ].join('\n');
    expect(verilog(source, 1, 'clog2')).toEqual(['1:declaration', '3:reference', '5:reference']);
    expect(verilog(source, 2, 'v')).toEqual(['2:declaration', '3:reference']);
  });

  it('hovering the inner reg does not highlight the outer wire', () => {
    expect(verilog(SHADOWING, 4, 'valid')).toEqual(['3:declaration', '4:reference']);
    expect(verilog(SHADOWING, 6, 'valid')).toEqual(['1:declaration', '6:reference']);
  });

  const COUNTER = [
    'module counter #(parameter N = 4) (', //            0
    '  input  wire clk,', //                             1
    '  output reg [N-1:0] q', //                         2
    ');', //                                             3
    '  localparam MAX = 9;', //                          4
    '  always @(posedge clk) begin : tick', //           5
    '    /* clk in a comment */', //                     6
    '    if (q == MAX) q <= 0; else q <= q + 1;', //     7
    '  end', //                                          8
    'endmodule', //                                      9
  ].join('\n');

  it('links ANSI ports, parameters and localparams', () => {
    expect(verilog(COUNTER, 5, 'clk')).toEqual(['1:declaration', '5:reference']);
    expect(verilog(COUNTER, 2, 'N')).toEqual(['0:declaration', '2:reference']);
    expect(verilog(COUNTER, 7, 'MAX')).toEqual(['4:declaration', '7:reference']);
    expect(verilog(COUNTER, 7, 'q')).toEqual(['2:declaration', '7:reference', '7:reference', '7:reference', '7:reference']);
  });

  it('ignores block comments, keywords and block labels', () => {
    expect(verilog(COUNTER, 6, 'clk')).toEqual([]);
    expect(verilog(COUNTER, 5, 'posedge')).toEqual([]);
    expect(verilog(COUNTER, 5, 'tick')).toEqual([]);
  });

  it('is case-sensitive', () => {
    const source = 'module m(input clk);\nwire Clk;\nassign Clk = clk;\nendmodule';
    expect(verilog(source, 2, 'clk')).toEqual(['0:declaration', '2:reference']);
    expect(verilog(source, 2, 'Clk')).toEqual(['1:declaration', '2:reference']);
  });

  it('links non-ANSI ports declared after the header', () => {
    const source = [
      'module m (clk, q);', //  0
      '  input clk;', //        1
      '  output q;', //         2
      '  reg q;', //            3
      'endmodule', //           4
    ].join('\n');
    expect(verilog(source, 0, 'q')).toEqual(['0:reference', '2:declaration', '3:reference']);
  });

  it('keeps a named port connection apart from the actual; selecting .clk shows the formal', () => {
    const tb = [
      'module tb;', //                            0
      '  reg clk;', //                            1
      '  counter u0 (.clk(clk), .q());', //       2
      'endmodule', //                             3
    ].join('\n');
    expect(verilog(tb, 2, 'clk', 1)).toEqual(['1:declaration', '2:reference']);
    expect(verilog(tb, 2, 'clk', 0)).toEqual(['2:declaration']);
  });

  it('makes all formals of one port of one module a single symbol', () => {
    const tb = [
      'module tb;', //                                  0
      '  reg a, b;', //                                 1
      '  and_gate u0 (.a(a), .b(b));', //               2
      '  and_gate u1 (.a(b), .b(a));', //               3
      '  or_gate  u2 (.a(a));', //                      4
      'endmodule', //                                   5
    ].join('\n');
    expect(verilog(tb, 2, 'a(')).toEqual(['2:declaration', '3:reference']); // not or_gate's .a
    expect(verilog(tb, 4, 'a(')).toEqual(['4:declaration']);
  });

  it('declares every name of a list and accepts SystemVerilog logic', () => {
    const source = 'module m;\n  logic a, b;\n  assign a = b;\nendmodule';
    expect(verilog(source, 2, 'b')).toEqual(['1:declaration', '2:reference']);
  });
});
