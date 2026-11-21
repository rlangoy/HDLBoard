// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { scanVerilog } from './verilogDirectiveScan';

const includesOf = (content: string) => scanVerilog(content).includes;
const isConditional = (content: string) => scanVerilog(content).conditional;

describe('the headers a file includes', () => {
  test('are named as written, without their folder', () => {
    expect(includesOf('`include "lib/defs.vh"\nmodule m; endmodule\n')).toEqual(['defs.vh']);
  });

  test('leave out one in a comment', () => {
    expect(includesOf('// `include "spare.vh"\nmodule m; endmodule\n')).toEqual([]);
  });

  test('leave out one in an inactive `ifdef branch', () => {
    expect(includesOf('`ifdef SPARE\n`include "spare.vh"\n`endif\n')).toEqual([]);
  });

  test('keep one in a branch the file’s own `define makes active', () => {
    expect(includesOf('`define SPARE\n`ifdef SPARE\n`include "spare.vh"\n`endif\n')).toEqual(['spare.vh']);
  });
});

describe('conditional compilation', () => {
  test('is an `ifdef on any macro, the file’s own too: an include or -D may change it', () => {
    expect(isConditional('`define FAST\n`ifndef FAST\nmodule a; endmodule\n`endif\n')).toBe(true);
  });

  test('is an `ifdef SYNTHESIS too: the compiler options may define it', () => {
    expect(isConditional('`ifdef SYNTHESIS\nmodule a; endmodule\n`endif\n')).toBe(true);
  });

  test('is not one in a comment', () => {
    expect(isConditional('// `ifdef BOARD_BUILD\nmodule a; endmodule\n')).toBe(false);
  });

  test('is not one in a string', () => {
    expect(isConditional('module a;\n  localparam HELP = "`ifdef DEBUG";\nendmodule\n')).toBe(false);
  });

  test('is not a file without any', () => {
    expect(isConditional('`timescale 1ns/1ps\nmodule a; endmodule\n')).toBe(false);
  });
});
