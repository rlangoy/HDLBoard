// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { suggestBoardInput, suggestBoardOutput } from './boardPortSuggestions.js';

const NOTHING_DECLARED = new Set<string>();

describe('suggestBoardInput', () => {
  test('suggests the board input a misspelled name was meant to be', () => {
    assert.equal(suggestBoardInput('SdsW', NOTHING_DECLARED), 'SW');
  });

  test('allows two edits from three letters on: KEY → KEY_N', () => {
    assert.equal(suggestBoardInput('KEY', NOTHING_DECLARED), 'KEY_N');
  });

  test('picks the single nearest of two similar inputs: clock50 → CLOCK_50', () => {
    assert.equal(suggestBoardInput('clock50', NOTHING_DECLARED), 'CLOCK_50');
  });

  test('suggests nothing for a name far from every board input', () => {
    assert.equal(suggestBoardInput('BTN', NOTHING_DECLARED), undefined);
  });

  test('never suggests an input the entity already declares', () => {
    assert.equal(suggestBoardInput('SdsW', new Set(['sw'])), undefined);
  });
});

describe('suggestBoardOutput', () => {
  test('suggests the board output a misspelled name was meant to be', () => {
    assert.equal(suggestBoardOutput('LEDRR', NOTHING_DECLARED), 'LEDR');
  });

  test('suggests nothing when two outputs are equally near', () => {
    assert.equal(suggestBoardOutput('HEX_N', NOTHING_DECLARED), undefined);
  });
});
