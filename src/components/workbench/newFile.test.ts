// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { newFileContent, newFileName, newFileNameError } from './newFile';

describe('newFileName', () => {
  test('adds the extension of the chosen language', () => {
    expect(newFileName('counter', 'vhdl')).toBe('counter.vhd');
    expect(newFileName('counter', 'verilog')).toBe('counter.v');
  });

  test('replaces a typed extension with the chosen language', () => {
    expect(newFileName(' counter.v ', 'vhdl')).toBe('counter.vhd');
    expect(newFileName('counter.vhdl', 'verilog')).toBe('counter.v');
    expect(newFileName('counter.v', 'verilog')).toBe('counter.v');
  });
});

describe('newFileNameError', () => {
  test('accepts a legal, unused name', () => {
    expect(newFileNameError('my_counter', 'verilog', [])).toBeUndefined();
    expect(newFileNameError('my_counter', 'vhdl', [])).toBeUndefined();
  });

  test('rejects an empty name', () => {
    expect(newFileNameError('  ', 'vhdl', [])).toBeDefined();
    expect(newFileNameError('.v', 'verilog', [])).toBeDefined();
  });

  test('rejects a name that is not an identifier of the language', () => {
    expect(newFileNameError('2count', 'verilog', [])).toBeDefined();
    expect(newFileNameError('my counter', 'verilog', [])).toBeDefined();
    expect(newFileNameError('_top', 'verilog', [])).toBeUndefined();
    expect(newFileNameError('_top', 'vhdl', [])).toBeDefined();
    expect(newFileNameError('a__b', 'vhdl', [])).toBeDefined();
  });

  test('rejects a name already in the project, ignoring case', () => {
    expect(newFileNameError('Blinktest', 'verilog', ['blinkTest.v'])).toBeDefined();
    expect(newFileNameError('blinkTest', 'vhdl', ['blinkTest.v'])).toBeUndefined();
  });
});

describe('newFileContent', () => {
  const BOARD_PORTS = ['CLOCK_50', 'SW', 'KEY_N', 'LEDR', 'HEX0_N', 'HEX1_N', 'HEX2_N', 'HEX3_N', 'HEX4_N', 'HEX5_N'];

  test('a VHDL file starts as an entity named after the file with every board port', () => {
    const content = newFileContent('counter.vhd', 'vhdl');
    expect(content).toMatch(/^entity counter is$/m);
    expect(content).toMatch(/^architecture rtl of counter is$/m);
    for (const port of BOARD_PORTS) expect(content).toMatch(new RegExp(`^\\s+${port}\\s+:`, 'm'));
  });

  test('a Verilog file starts as a module named after the file with every board port', () => {
    const content = newFileContent('counter.v', 'verilog');
    expect(content).toMatch(/^module counter \(/);
    expect(content).toMatch(/endmodule\n$/);
    for (const port of BOARD_PORTS) expect(content).toMatch(new RegExp(`wire(\\s+\\[\\d+:0\\])?\\s+${port}\\b`));
  });
});
