// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { normaliseBoardBits } from './boardBits.js';

describe('normaliseBoardBits', () => {
  test('leaves defined levels alone', () => {
    assert.equal(normaliseBoardBits('0101'), '0101');
  });

  test('turns undefined and high-impedance levels into X, whatever their case', () => {
    assert.equal(normaliseBoardBits('0x1Xz0Z'), '0X1XX0X');
  });

  test('keeps the length', () => {
    assert.equal(normaliseBoardBits('xxxx').length, 4);
  });
});
