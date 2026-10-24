// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { findTopEntity } from './portDetect.js';
import { DEFAULT_BOARD_IO } from './engines/boardPorts.js';
import { DE1_SOC_BOARD_IO } from './testSupport/boards.js';

/** docs/impl_split_screen.md D20, R-6, R-7: `findTopEntity` with a run target. */

const ALU_WITH_TB = `entity alu is port (a : in bit; y : out bit); end entity;
architecture rtl of alu is begin y <= a; end;
entity alu_tb is end entity;
architecture sim of alu_tb is begin end;`;
const files = [{ name: 'alu.vhd', content: ALU_WITH_TB }];

describe('findTopEntity with a run target', () => {
  test('elaborates the named entity, portless -> batch ports', () => {
    const top = findTopEntity(files, DEFAULT_BOARD_IO, 'alu.vhd', 'ALU_TB');
    assert.ok(!('message' in top));
    assert.equal(top.name, 'alu_tb');
    assert.equal(top.ports.size, 0);
  });

  test('R-6: a unit the file does not declare fails with a clear message', () => {
    assert.deepEqual(findTopEntity(files, DEFAULT_BOARD_IO, 'alu.vhd', 'nosuch'), { message: 'alu.vhd declares no entity nosuch.' });
  });

  test('R-7: without a target, the file\'s first entity, as before', () => {
    const top = findTopEntity(files, DEFAULT_BOARD_IO, 'alu.vhd');
    assert.ok(!('message' in top));
    assert.equal(top.name, 'alu');
  });
});

describe('findTopEntity on another board', () => {
  const design = (ports: string) => `entity top is port (${ports}); end entity;\narchitecture rtl of top is begin end;`;
  const helper = { name: 'helper.vhd', content: `entity helper is port (a : in bit); end entity;\narchitecture rtl of helper is begin end;` };

  test('picks the entity with the board\'s own names', () => {
    const files = [helper, { name: 'top.vhd', content: design('KEY : in bit_vector(3 downto 0); HEX0 : out bit_vector(6 downto 0)') }];
    const top = findTopEntity(files, DE1_SOC_BOARD_IO);
    assert.ok(!('message' in top));
    assert.equal(top.name, 'top');
  });

  test('lists the board\'s names when no entity matches them', () => {
    const files = [{ name: 'top.vhd', content: design('KEY_N : in bit_vector(3 downto 0)') }];
    const top = findTopEntity(files, DE1_SOC_BOARD_IO);
    assert.ok('message' in top);
    assert.match(top.message, /\(clock_50, clock_500hz, sw, key, ledr, hex0, hex1, hex2, hex3, hex4, hex5, rst\)/);
  });
});
