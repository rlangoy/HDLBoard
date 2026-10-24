// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DEFAULT_BOARD_IO } from './engines/boardPorts.js';
import { generateTestbench } from './tbTemplate.js';
import { DE1_SOC_BOARD_IO } from './testSupport/boards.js';
import { readFixture } from './testSupport/fixture.js';

const DEFAULT_TOP_PORTS = new Set(['clock_50', 'sw', 'key_n', 'ledr', 'hex0_n', 'hex1_n', 'hex2_n', 'hex3_n', 'hex4_n', 'hex5_n']);
const DE1_SOC_TOP_PORTS = new Set(['clock_50', 'sw', 'key', 'ledr', 'hex0', 'hex1', 'hex2', 'hex3', 'hex4', 'hex5']);

describe('generateTestbench', () => {
  // Captured from the generator before boards were configurable: the Default board must not change a byte.
  test('on the Default board is the testbench it always was', () => {
    assert.equal(generateTestbench('DE1_SoC', DEFAULT_TOP_PORTS, DEFAULT_BOARD_IO), readFixture('vhdl', 'golden/hdl_board_tb.DE1_SoC.vhdl'));
  });

  test('wires the legacy rst from the first pushbutton, as it always did', () => {
    const ports = new Set(['clock_500hz', 'key_n', 'rst', 'ledr']);
    const options = { pacingFromStdin: true, tiedInputs: [{ name: 'dummy', value: "'0'" }] };
    assert.equal(generateTestbench('legacy', ports, DEFAULT_BOARD_IO, options), readFixture('vhdl', 'golden/hdl_board_tb.legacy_rst.vhdl'));
  });

  test('on the DE1-SoC connects KEY and HEX0…HEX5', () => {
    assert.equal(generateTestbench('DE1_SoC', DE1_SOC_TOP_PORTS, DE1_SOC_BOARD_IO), readFixture('vhdl', 'golden/hdl_board_tb.de1-soc.vhdl'));
  });

  test('on the DE1-SoC leaves the Default names unconnected', () => {
    const text = generateTestbench('top', new Set(['key_n', 'hex0_n', 'sw']), DE1_SOC_BOARD_IO);
    assert.match(text, /sw => sw_sig/);
    assert.doesNotMatch(text, /key_n =>|hex0_n =>/);
  });

  test('ties rst off on a board whose pushbuttons the entity lacks', () => {
    assert.match(generateTestbench('top', new Set(['key_n', 'rst']), DE1_SOC_BOARD_IO), /rst_sig <= '0';/);
    assert.match(generateTestbench('top', new Set(['key', 'rst']), DE1_SOC_BOARD_IO), /rst_sig <= not key_sig\(0\);/);
  });
});
