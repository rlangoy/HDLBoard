// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { decodeClientFrame, encodeClientFrame, parseRunHeader } from './protocol.js';

/** docs/impl_split_screen.md D20: `RUN <topFile> [@<unit>]`. */

const BODY = '@@FILE alu.vhd@@\nentity alu is end;';

describe('the RUN header', () => {
  test('without a target, the whole inline text is the top file, as before (R-7)', () => {
    assert.deepEqual(parseRunHeader('my alu.vhd'), { topFile: 'my alu.vhd' });
    assert.deepEqual(parseRunHeader(''), { topFile: undefined });
  });

  test('a trailing @unit after an accepted extension is the run target', () => {
    assert.deepEqual(parseRunHeader('alu_with_tb.vhd @alu_tb'), { topFile: 'alu_with_tb.vhd', runTarget: 'alu_tb' });
    assert.deepEqual(parseRunHeader('my alu.v @alu'), { topFile: 'my alu.v', runTarget: 'alu' });
  });

  test('an @ that does not follow an extension is part of the file name', () => {
    assert.deepEqual(parseRunHeader('a @b.vhd'), { topFile: 'a @b.vhd' });
  });

  test('decode and encode round-trip, with and without a target', () => {
    for (const head of ['RUN alu.vhd', 'RUN alu.vhd @alu_tb', 'RUN my alu.v @alu']) {
      const frame = decodeClientFrame(`${head}\n${BODY}`);
      assert.equal(encodeClientFrame(frame as Parameters<typeof encodeClientFrame>[0]).split('\n')[0], head);
    }
  });

  test('a frame without a target carries no runTarget key', () => {
    assert.equal('runTarget' in (decodeClientFrame(`RUN alu.vhd\n${BODY}`) as object), false);
  });
});
