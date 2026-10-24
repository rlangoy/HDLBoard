// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DE1_SOC_BOARD_IO } from '../testSupport/boards.js';
import {
  boardBindings,
  boardInputNames,
  boardOutputNames,
  boardPortKeys,
  declaresPort,
  DEFAULT_BOARD_IO,
  describeBoardPorts,
} from './boardPorts.js';

describe('boardBindings', () => {
  test('lists the ports in port-map order, each with its testbench signal', () => {
    assert.deepEqual(
      boardBindings(DE1_SOC_BOARD_IO).map(({ name, signal, direction }) => `${name}:${signal}:${direction}`),
      [
        'CLOCK_50:clk_sig:in',
        'CLOCK_500Hz:clk500_sig:in',
        'SW:sw_sig:in',
        'KEY:key_sig:in',
        'LEDR:ledr_sig:out',
        ...[0, 1, 2, 3, 4, 5].map((i) => `HEX${i}:hex${i}_sig:out`),
      ],
    );
  });

  test('matches by the lower-case name', () => {
    assert.equal(boardBindings(DEFAULT_BOARD_IO)[3].key, 'key_n');
  });
});

describe('the names in messages', () => {
  test('are the inputs and outputs as the board spells them', () => {
    assert.deepEqual(boardInputNames(DEFAULT_BOARD_IO), ['CLOCK_50', 'CLOCK_500Hz', 'SW', 'KEY_N']);
    assert.deepEqual(boardOutputNames(DE1_SOC_BOARD_IO), ['LEDR', 'HEX0', 'HEX1', 'HEX2', 'HEX3', 'HEX4', 'HEX5']);
  });

  test('describe the board with the displays as a range', () => {
    assert.equal(describeBoardPorts(DEFAULT_BOARD_IO), 'CLOCK_50, CLOCK_500Hz, SW, KEY_N, LEDR, HEX0_N…HEX5_N');
    assert.equal(describeBoardPorts(DE1_SOC_BOARD_IO), 'CLOCK_50, CLOCK_500Hz, SW, KEY, LEDR, HEX0…HEX5');
  });
});

describe('boardPortKeys', () => {
  test('adds the legacy rst only when asked, last', () => {
    assert.ok(!boardPortKeys(DEFAULT_BOARD_IO).has('rst'));
    assert.equal([...boardPortKeys(DEFAULT_BOARD_IO, { legacyReset: true })].at(-1), 'rst');
  });

  test('tells whether a design declares a board port, ignoring case', () => {
    assert.equal(declaresPort(new Set(['clock_50']), DE1_SOC_BOARD_IO.clock50), true);
    assert.equal(declaresPort(new Set(['key_n']), DE1_SOC_BOARD_IO.pushbuttons), false);
  });
});
