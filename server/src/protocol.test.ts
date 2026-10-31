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

describe('STIM', () => {
  test('one state, as always', () => {
    assert.deepEqual(decodeClientFrame('STIM 00000000001111'), { verb: 'STIM', steps: [{ bits: '00000000001111' }] });
  });

  test('timed steps: a bouncing button, each held its ns before the next', () => {
    assert.deepEqual(decodeClientFrame('STIM 1110/20000 1111/150 1110'), {
      verb: 'STIM',
      steps: [{ bits: '1110', holdNs: 20000 }, { bits: '1111', holdNs: 150 }, { bits: '1110' }],
    });
  });

  test('decode and encode round-trip', () => {
    for (const text of ['STIM 1111', 'STIM 1110/20000 1111/150 1110']) {
      const frame = decodeClientFrame(text);
      assert.equal(encodeClientFrame(frame as Parameters<typeof encodeClientFrame>[0]), text);
    }
  });

  test('refuses a hold of zero, a hold past 1 s, a malformed step and too many steps', () => {
    for (const text of ['STIM 1110/0', 'STIM 1110/1000000001', 'STIM 1110/ 1111', 'STIM 11x0', `STIM ${Array(33).fill('1').join(' ')}`]) {
      assert.ok('message' in decodeClientFrame(text), text);
    }
  });
});
