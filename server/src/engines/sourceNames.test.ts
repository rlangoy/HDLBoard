// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { firstUnsafeName } from './sourceNames.js';

describe('firstUnsafeName', () => {
  test('accepts plain file names', () => {
    assert.equal(firstUnsafeName([{ name: 'top.vhd' }, { name: 'my design (2).v' }]), undefined);
  });

  test('refuses a name Windows cannot store, before any engine writes it', () => {
    for (const name of ['a<b.vhd', 'a>b.vhd', 'a|b.v', 'what?.vhd', 'all*.v', 'say"hi".vhd', '.']) {
      assert.match(firstUnsafeName([{ name }]) ?? '', /cannot be "\." or contain/, name);
    }
  });

  test('still refuses paths and options', () => {
    assert.match(firstUnsafeName([{ name: '../x.vhd' }]) ?? '', /plain file name/);
    assert.match(firstUnsafeName([{ name: '-o.v' }]) ?? '', /option/);
  });
});
