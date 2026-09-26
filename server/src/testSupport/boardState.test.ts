// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { matchesExpectation, normalizeState } from './boardState.js';

const ALL_OFF_LEDS = '0'.repeat(10);
const BLANK_HEX = '1'.repeat(42);
const bits = (ledr: string, hex: string) => ledr + hex;

describe('normalizeState', () => {
  test('splits the 52 bits into LEDR and the six HEX displays', () => {
    const state = normalizeState(bits('1010101010', BLANK_HEX));
    assert.equal(state.ledr, '1010101010');
    assert.equal(state.hex, BLANK_HEX);
  });

  test('reads an undefined LED as off, as the frontend does', () => {
    assert.equal(normalizeState(bits('1XX0000000', BLANK_HEX)).ledr, '1000000000');
  });

  test('reads an undefined segment as off (1, active low), as the frontend does', () => {
    const state = normalizeState(bits(ALL_OFF_LEDS, 'X'.repeat(42)));
    assert.equal(state.hex, BLANK_HEX);
  });

  test('rejects a state of the wrong length', () => {
    assert.throws(() => normalizeState('0101'), /52/);
  });
});

describe('matchesExpectation', () => {
  const state = normalizeState(bits('0000000101', BLANK_HEX));

  test('matches equal LEDs', () => {
    assert.equal(matchesExpectation(state, { ledr: '0000000101' }), true);
  });

  test('does not match different LEDs', () => {
    assert.equal(matchesExpectation(state, { ledr: '0000000100' }), false);
  });

  test('treats "blank" as all six displays off', () => {
    assert.equal(matchesExpectation(state, { hex: 'blank' }), true);
  });

  test('does not match "blank" when a segment is lit', () => {
    const lit = normalizeState(bits(ALL_OFF_LEDS, '0' + '1'.repeat(41)));
    assert.equal(matchesExpectation(lit, { hex: 'blank' }), false);
  });

  test('matches an explicit display pattern', () => {
    assert.equal(matchesExpectation(state, { hex: BLANK_HEX }), true);
  });

  test('ignores a field the expectation leaves out', () => {
    assert.equal(matchesExpectation(state, {}), true);
  });

  test('requires every stated field to match', () => {
    assert.equal(matchesExpectation(state, { ledr: '0000000101', hex: '0'.repeat(42) }), false);
  });
});
