// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { suggestBoardInput, suggestBoardOutput } from './boardPortSuggestions.js';
import { DEFAULT_BOARD_IO } from './boardPorts.js';
import { DE1_SOC_BOARD_IO } from '../testSupport/boards.js';

const NOTHING_DECLARED = new Set<string>();

describe('suggestBoardInput', () => {
  test('suggests the board input a misspelled name was meant to be', () => {
    assert.equal(suggestBoardInput('SdsW', NOTHING_DECLARED, DEFAULT_BOARD_IO), 'SW');
  });

  test('allows two edits from three letters on: KEY → KEY_N', () => {
    assert.equal(suggestBoardInput('KEY', NOTHING_DECLARED, DEFAULT_BOARD_IO), 'KEY_N');
  });

  test('picks the single nearest of two similar inputs: clock50 → CLOCK_50', () => {
    assert.equal(suggestBoardInput('clock50', NOTHING_DECLARED, DEFAULT_BOARD_IO), 'CLOCK_50');
  });

  test('suggests nothing for a name far from every board input', () => {
    assert.equal(suggestBoardInput('BTN', NOTHING_DECLARED, DEFAULT_BOARD_IO), undefined);
  });

  test('never suggests an input the entity already declares', () => {
    assert.equal(suggestBoardInput('SdsW', new Set(['sw']), DEFAULT_BOARD_IO), undefined);
  });
});

describe('suggestBoardOutput', () => {
  test('suggests the board output a misspelled name was meant to be', () => {
    assert.equal(suggestBoardOutput('LEDRR', NOTHING_DECLARED, DEFAULT_BOARD_IO), 'LEDR');
  });

  test('suggests nothing when two outputs are equally near', () => {
    assert.equal(suggestBoardOutput('HEX_N', NOTHING_DECLARED, DEFAULT_BOARD_IO), undefined);
  });
});

describe('on the DE1-SoC board', () => {
  test('a Default name is pointed at its DE1-SoC name: KEY_N → KEY', () => {
    assert.equal(suggestBoardInput('KEY_N', NOTHING_DECLARED, DE1_SOC_BOARD_IO), 'KEY');
  });

  test('a Default display name is pointed at its DE1-SoC name: HEX0_N → HEX0', () => {
    assert.equal(suggestBoardOutput('HEX0_N', NOTHING_DECLARED, DE1_SOC_BOARD_IO), 'HEX0');
  });
});
