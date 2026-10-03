// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { findTopEntity } from './portDetect.js';

/** docs/impl_split_screen.md D20, R-6, R-7: `findTopEntity` with a run target. */

const ALU_WITH_TB = `entity alu is port (a : in bit; y : out bit); end entity;
architecture rtl of alu is begin y <= a; end;
entity alu_tb is end entity;
architecture sim of alu_tb is begin end;`;
const files = [{ name: 'alu.vhd', content: ALU_WITH_TB }];

describe('findTopEntity with a run target', () => {
  test('elaborates the named entity, portless -> batch ports', () => {
    const top = findTopEntity(files, 'alu.vhd', 'ALU_TB');
    assert.ok(!('message' in top));
    assert.equal(top.name, 'alu_tb');
    assert.equal(top.ports.size, 0);
  });

  test('R-6: a unit the file does not declare fails with a clear message', () => {
    assert.deepEqual(findTopEntity(files, 'alu.vhd', 'nosuch'), { message: 'alu.vhd declares no entity nosuch.' });
  });

  test('R-7: without a target, the file\'s first entity, as before', () => {
    const top = findTopEntity(files, 'alu.vhd');
    assert.ok(!('message' in top));
    assert.equal(top.name, 'alu');
  });
});
