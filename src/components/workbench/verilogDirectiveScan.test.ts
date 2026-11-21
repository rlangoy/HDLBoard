// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { activeIncludes, dependsOnOutsideMacros } from './verilogDirectiveScan';

describe('the headers a file includes', () => {
  test('are named as written, without their folder', () => {
    expect(activeIncludes('`include "lib/defs.vh"\nmodule m; endmodule\n')).toEqual(['defs.vh']);
  });

  test('leave out one in a comment', () => {
    expect(activeIncludes('// `include "spare.vh"\nmodule m; endmodule\n')).toEqual([]);
  });

  test('leave out one in an inactive `ifdef branch', () => {
    expect(activeIncludes('`ifdef SPARE\n`include "spare.vh"\n`endif\n')).toEqual([]);
  });

  test('keep one in a branch the file’s own `define makes active', () => {
    expect(activeIncludes('`define SPARE\n`ifdef SPARE\n`include "spare.vh"\n`endif\n')).toEqual(['spare.vh']);
  });
});

describe('a file whose code a macro from elsewhere picks', () => {
  test('is one testing a macro it does not define', () => {
    expect(dependsOnOutsideMacros('`ifdef BOARD_BUILD\nmodule a; endmodule\n`endif\n')).toBe(true);
  });

  test('is not one testing only its own macros', () => {
    expect(dependsOnOutsideMacros('`define FAST\n`ifndef FAST\nmodule a; endmodule\n`endif\n')).toBe(false);
  });

  test('is not one testing only SYNTHESIS, which the editor and the simulator both leave undefined', () => {
    expect(dependsOnOutsideMacros('`ifdef SYNTHESIS\nmodule a; endmodule\n`endif\n')).toBe(false);
  });

  test('is not one whose test is in a comment', () => {
    expect(dependsOnOutsideMacros('// `ifdef BOARD_BUILD\nmodule a; endmodule\n')).toBe(false);
  });
});
