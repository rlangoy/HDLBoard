// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { analyzeFile } from './tbDetect/analyzeProject';
import { TEST_BOARD_PORTS } from './tbDetect/fixtures.testSupport';
import { runningTopOf } from './useTopFileSuggestion';

/** chosen.v: a board design `board` and its testbench `board_tb`, in one file. */
const CHOSEN = {
  id: 'chosen.v',
  name: 'chosen.v',
  folder: 'verilog' as const,
  content:
    'module board(input [9:0] SW, output [9:0] LEDR);\n  assign LEDR = SW;\nendmodule\n' +
    'module board_tb;\n  reg [9:0] SW;\n  wire [9:0] LEDR;\n  board dut(.SW(SW), .LEDR(LEDR));\n  initial begin #10 $finish; end\nendmodule\n',
};

const analysisOf = (content: string) => () => analyzeFile({ ...CHOSEN, content }, TEST_BOARD_PORTS);
const RENAMED = CHOSEN.content.replace(/\bboard\b/g, 'renamed');

describe('what Start runs, as the question and the Top line name it', () => {
  test('is the remembered unit while the file still declares it', () => {
    expect(runningTopOf(CHOSEN, 'board', analysisOf(CHOSEN.content))?.label).toBe('chosen.v › board');
  });

  test('is the unit Start falls back to once the remembered one was renamed away', () => {
    expect(runningTopOf(CHOSEN, 'board', analysisOf(RENAMED))?.label).toBe('chosen.v › board_tb');
  });

  test('is the same run whether Start chose its unit or it was named', () => {
    expect(runningTopOf(CHOSEN, 'board_tb', analysisOf(CHOSEN.content))?.key).toBe(runningTopOf(CHOSEN, null, analysisOf(CHOSEN.content))?.key);
  });

  test('is nothing without a Top-File', () => {
    expect(runningTopOf(undefined, null, analysisOf(CHOSEN.content))).toBeNull();
  });
});
