// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readFixture } from '../testSupport/fixture.js';
import { buildBoardTestbench, instantiation, tieOffs } from './testbench.js';

/** Board port names as `boardPortSpellings` returns them: lower-case board name -> declared spelling. */
const spelled = (...names: string[]): Map<string, string> => new Map(names.map((name) => [name.toLowerCase(), name]));

const FULL_BOARD = spelled('CLOCK_50', 'SW', 'KEY_N', 'LEDR', 'HEX0_N', 'HEX1_N', 'HEX2_N', 'HEX3_N', 'HEX4_N', 'HEX5_N');

describe('instantiation', () => {
  test('connects every board port the design declares, by name', () => {
    assert.equal(
      instantiation('DE1_SoC', FULL_BOARD),
      '  DE1_SoC uut (.CLOCK_50(clk_sig), .SW(sw_sig), .KEY_N(key_sig), .LEDR(ledr_sig), ' +
        '.HEX0_N(hex0_sig), .HEX1_N(hex1_sig), .HEX2_N(hex2_sig), .HEX3_N(hex3_sig), .HEX4_N(hex4_sig), .HEX5_N(hex5_sig));',
    );
  });

  test('connects only the ports that are declared', () => {
    const text = instantiation('top', spelled('SW', 'LEDR'));
    assert.match(text, /\.SW\(sw_sig\)/);
    assert.match(text, /\.LEDR\(ledr_sig\)/);
    assert.ok(!['.KEY_N', '.CLOCK_50', '.HEX0_N'].some((absent) => text.includes(absent)));
  });

  test('connects by the spelling the design declared', () => {
    assert.match(instantiation('top', spelled('Clock_50', 'key_n')), /\.Clock_50\(clk_sig\), \.key_n\(key_sig\)/);
  });

  test('uses the top module name verbatim', () => {
    assert.match(instantiation('Blink_Top', spelled('SW')), /^ {2}Blink_Top uut \(/);
  });

  test('connects the 500 Hz clock, which only some designs declare', () => {
    assert.match(instantiation('top', spelled('CLOCK_500Hz')), /\.CLOCK_500Hz\(clk500_sig\)/);
  });
});

describe('tieOffs', () => {
  test('ties every undeclared output to its off value', () => {
    const lines = tieOffs(spelled('SW', 'LEDR'));
    assert.deepEqual(lines, [
      "assign hex0_sig = 7'h7F;",
      "assign hex1_sig = 7'h7F;",
      "assign hex2_sig = 7'h7F;",
      "assign hex3_sig = 7'h7F;",
      "assign hex4_sig = 7'h7F;",
      "assign hex5_sig = 7'h7F;",
    ]);
  });

  test('ties the LEDs off when the design has none', () => {
    assert.ok(tieOffs(spelled('SW')).includes("assign ledr_sig = 10'b0;"));
  });

  test('ties nothing off when the design declares every output', () => {
    assert.deepEqual(tieOffs(FULL_BOARD), []);
  });

  test('does not tie off a display the design drives', () => {
    const lines = tieOffs(spelled('HEX2_N'));
    assert.ok(!lines.some((line) => line.includes('hex2_sig')));
    assert.ok(lines.some((line) => line.includes('hex3_sig')));
  });

  test('never ties off an input, which the testbench itself drives', () => {
    assert.ok(!tieOffs(spelled('LEDR')).some((line) => /sw_sig|key_sig|clk/.test(line)));
  });
});

describe('buildBoardTestbench', () => {
  const wrapperFor = (...names: string[]) => buildBoardTestbench('DE1_SoC', spelled(...names));
  const fullBoard = () => buildBoardTestbench('DE1_SoC', FULL_BOARD);

  test('for the full board equals the verified golden wrapper', () => {
    assert.equal(fullBoard(), readFixture('verilog', 'golden/hdl_board_tb.DE1_SoC.v'));
  });

  test('generates the 50 MHz clock when CLOCK_50 is declared', () => {
    assert.match(wrapperFor('CLOCK_50', 'LEDR'), /always #10 clk_sig = ~clk_sig;/);
  });

  test('generates no 50 MHz clock when CLOCK_50 is not declared', () => {
    assert.doesNotMatch(wrapperFor('SW', 'LEDR'), /always #10 clk_sig/);
  });

  test('always generates the 500 Hz clock, declared or not', () => {
    assert.match(wrapperFor('SW'), /always #1000000 clk500_sig = ~clk500_sig;/);
    assert.match(wrapperFor('CLOCK_500Hz'), /always #1000000 clk500_sig = ~clk500_sig;/);
  });

  test('assembles the 52-bit state as LEDR then HEX0 to HEX5, the order STATE uses', () => {
    assert.match(
      fullBoard(),
      /wire \[51:0\] board_bits = \{ledr_sig, hex0_sig, hex1_sig, hex2_sig, hex3_sig, hex4_sig, hex5_sig\};/,
    );
  });

  test('ties off undeclared outputs and leaves declared ones alone', () => {
    assert.match(wrapperFor('SW'), /assign ledr_sig = 10'b0;/);
    assert.doesNotMatch(wrapperFor('SW', 'LEDR'), /assign ledr_sig/);
    assert.doesNotMatch(fullBoard(), /assign /);
  });

  test('instantiates the top module by the name it was given', () => {
    assert.match(buildBoardTestbench('Blink_Top', spelled('SW')), /^ {2}Blink_Top uut \(\.SW\(sw_sig\)\);$/m);
  });

  test('reads its file settings from plusargs, so nothing is recompiled per run', () => {
    const text = fullBoard();
    assert.match(text, /\$value\$plusargs\("input_file=%s"/);
    assert.match(text, /\$value\$plusargs\("output_file=%s"/);
    assert.match(text, /\$value\$plusargs\("heartbeat_file=%s"/);
  });

  test('reads its timing settings from plusargs too', () => {
    assert.match(fullBoard(), /\$value\$plusargs\("poll_interval_ns=%d"/);
    assert.match(fullBoard(), /\$value\$plusargs\("min_dwell_ns=%d"/);
  });

  test('takes its real-time pacing grants from standard input', () => {
    assert.match(fullBoard(), /\$fgets\(pace_line, 32'h8000_0000\)/);
  });

  test('has no rst handling: Verilog has no legacy to tolerate', () => {
    assert.doesNotMatch(wrapperFor('CLOCK_50', 'KEY_N', 'LEDR'), /rst/i);
  });

  test('carries its own timescale, so it does not depend on the file compiled before it', () => {
    assert.ok(fullBoard().startsWith('`timescale 1ns/1ps\n'));
  });

  test('is a module called hdl_board_tb, ending with endmodule and a newline', () => {
    assert.match(fullBoard(), /^module hdl_board_tb;$/m);
    assert.ok(fullBoard().endsWith('endmodule\n'));
  });

  test('is byte-for-byte the same every time', () => {
    assert.equal(wrapperFor('SW', 'LEDR'), wrapperFor('SW', 'LEDR'));
  });

  test('has no trailing whitespace', () => {
    assert.doesNotMatch(wrapperFor('SW'), /[ \t]+$/m);
  });

  test('has no run of blank lines', () => {
    assert.doesNotMatch(wrapperFor('SW'), /\n\n\n/);
  });
});
