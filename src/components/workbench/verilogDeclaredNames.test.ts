// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { EXAMPLE_FILES } from './files';
import { verilogDeclaredNames } from './verilogDeclaredNames';

const fixtures = import.meta.glob<string>('../../../tests/fixtures/verilog/*.v', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function fixture(name: string): string {
  const found = Object.entries(fixtures).find(([path]) => path.endsWith(`/${name}`));
  if (!found) throw new Error(`no fixture ${name}`);
  return found[1];
}

describe('verilogDeclaredNames: each pattern', () => {
  test.each([
    ['an ANSI port list, with types and ranges', 'module m (input wire [9:0] SW, KEY, output reg q);', ['m', 'SW', 'KEY', 'q']],
    ['nets and variables, several per line, with initial values', "reg [3:0] a = 4'b0, b; wire c;", ['a', 'b', 'c']],
    ['parameters, whose values are expressions', 'localparam N = $clog2(W + 1); parameter W = 4;', ['N', 'W']],
    ['signed and other modifiers', 'input wire signed [7:0] sample;', ['sample']],
    ['integer, genvar, real and time', 'integer i; genvar g; real r; time t;', ['i', 'g', 'r', 't']],
    ['a function and its inputs', 'function [3:0] add; input [3:0] x; endfunction', ['add', 'x']],
    ['a task with a parameter list', 'task press(input integer key); endtask', ['press', 'key']],
    ['an instance, with and without parameters', 'counter u0 (.a(b)); counter #(8) u1 (.a(b));', ['u0', 'u1']],
    ['a block label', 'always @* begin : comb end', ['comb']],
    ['a macro and a condition name', '`define WIDTH 4\n`ifdef SIM\n`endif', ['WIDTH', 'SIM']],
    ['an event', 'event done;', ['done']],
  ])('%s', (_what, source, expected) => {
    expect(verilogDeclaredNames(source)).toEqual(expected);
  });
});

describe('verilogDeclaredNames: what is not a declaration', () => {
  test('names in comments and strings, also in a block comment over several lines', () => {
    const source = '// reg fake;\n/* wire hidden,\n   reg alsoHidden; */\n$display("reg quoted;");\nwire real_one;';
    expect(verilogDeclaredNames(source)).toEqual(['real_one']);
  });

  test('a name that is only used, and a macro that is only used', () => {
    expect(verilogDeclaredNames('assign LEDR = `WIDTH + counter;')).toEqual([]);
  });

  test.each([
    ['a misspelled direction after a comma', 'module m (input wire CLOCK, inptu wire [9:0] SW);', ['m', 'CLOCK', 'SW']],
    ['a misspelled type after a direction', 'module m (input wrie [9:0] SW);', ['m', 'SW']],
  ])('a misspelled keyword where a name could stand: %s', (_what, source, expected) => {
    expect(verilogDeclaredNames(source)).toEqual(expected);
  });

  test('an array is still a name: `reg mem [0:3];`', () => {
    expect(verilogDeclaredNames('reg [7:0] mem [0:3]; wire w;')).toEqual(['mem', 'w']);
  });

  test('case matters: Verilog names are case-sensitive', () => {
    expect(verilogDeclaredNames('wire Clock, clock;')).toEqual(['Clock', 'clock']);
  });
});

describe('verilogDeclaredNames: the Verilog fixtures', () => {
  test('blinkTest.v', () => {
    expect(verilogDeclaredNames(fixture('blinkTest.v')).sort()).toEqual(
      [
        'blinkTest', 'CLOCK_500Hz', 'SW', 'KEY_N', 'LEDR', 'HEX0_N', 'HEX1_N', 'HEX2_N', 'HEX3_N', 'HEX4_N', 'HEX5_N',
        'TOGGLE_COUNT', 'COUNTER_WIDTH', 'counter', 'led_state',
      ].sort(),
    );
  });

  test('keyCouter2Led.v', () => {
    expect(verilogDeclaredNames(fixture('keyCouter2Led.v')).sort()).toEqual(
      ['counter8', 'CLOCK_50', 'KEY_N', 'LEDR', 'count', 'key_prev'].sort(),
    );
  });

  test('tb_counter8.v: variables, an instance, a task and its parameter', () => {
    expect(verilogDeclaredNames(fixture('tb_counter8.v')).sort()).toEqual(
      ['tb_counter8', 'CLOCK_50', 'KEY_N', 'LEDR', 'dut', 'press', 'key'].sort(),
    );
  });

  test('every Verilog starter declares at least its module and a port', () => {
    for (const file of EXAMPLE_FILES.filter((f) => f.folder === 'verilog')) {
      expect(verilogDeclaredNames(file.content).length).toBeGreaterThan(1);
    }
  });
});
