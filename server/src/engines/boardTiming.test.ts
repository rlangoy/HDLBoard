// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { TIMING_WITHOUT_CLOCK_50, TIMING_WITH_CLOCK_50 } from './boardTiming.js';

describe('board timing', () => {
  test('polls every 10 µs and holds a change for one poll when a 50 MHz clock dominates the simulation', () => {
    assert.deepEqual(TIMING_WITH_CLOCK_50, { pollIntervalNs: 10_000, minDwellNs: 10_000 });
  });

  test('polls every millisecond and holds a change for 4 ms when nothing but slow clocks run', () => {
    assert.deepEqual(TIMING_WITHOUT_CLOCK_50, { pollIntervalNs: 1_000_000, minDwellNs: 4_000_000 });
  });

  test('holds a change for at least two edges of the 500 Hz clock in the slow regime, so a design sampling KEY_N on it sees every press', () => {
    const TWO_EDGES_OF_500_HZ_NS = 2_000_000;
    assert.ok(TIMING_WITHOUT_CLOCK_50.minDwellNs >= TWO_EDGES_OF_500_HZ_NS);
  });

  test('never holds a change for less than a poll, in either regime', () => {
    assert.ok(TIMING_WITH_CLOCK_50.minDwellNs >= TIMING_WITH_CLOCK_50.pollIntervalNs);
    assert.ok(TIMING_WITHOUT_CLOCK_50.minDwellNs >= TIMING_WITHOUT_CLOCK_50.pollIntervalNs);
  });
});
