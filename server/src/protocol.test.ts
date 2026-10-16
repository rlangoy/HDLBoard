// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { decodeClientFrame, decodeServerFrame, encodeClientFrame, encodeServerFrame, parseRunHeader } from './protocol.js';
import { readFixture } from './testSupport/fixture.js';

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

interface FrameFixture {
  valid: Array<{ why: string; frame: string; line: { kind: string; instance: string; timeNs: number; payload: string } }>;
  invalid: Array<{ why: string; frame: string }>;
}

/** Shared with the frontend's decoder (docs/plugin_batch_implementation_plan.md § 6.3). */
const PLUGIN_FRAMES = JSON.parse(readFixture('plugins', 'pluginFrames.json')) as FrameFixture;

describe('the PLUGIN frame', () => {
  for (const { why, frame, line } of PLUGIN_FRAMES.valid) {
    test(`decodes ${why}`, () => {
      assert.deepEqual(decodeServerFrame(frame), { verb: 'PLUGIN', ...line });
    });
  }

  for (const { why, frame } of PLUGIN_FRAMES.invalid) {
    test(`rejects ${why}`, () => {
      assert.ok('message' in decodeServerFrame(frame));
    });
  }

  test('encodes as it decodes', () => {
    const frame = { verb: 'PLUGIN', kind: 'uart', instance: 'TX', timeNs: 83495, payload: '48 FE' } as const;
    assert.deepEqual(decodeServerFrame(encodeServerFrame(frame)), frame);
  });
});

describe('the PLUGINS verb', () => {
  test('carries the enabled ids', () => {
    assert.deepEqual(decodeClientFrame('PLUGINS rs232,i2c'), { verb: 'PLUGINS', ids: ['rs232', 'i2c'] });
  });

  test('with no argument enables none', () => {
    assert.deepEqual(decodeClientFrame('PLUGINS'), { verb: 'PLUGINS', ids: [] });
  });

  test('rejects an id that is not lower case', () => {
    assert.ok('message' in decodeClientFrame('PLUGINS RS232'));
  });

  test('round-trips', () => {
    assert.equal(encodeClientFrame({ verb: 'PLUGINS', ids: ['rs232'] }), 'PLUGINS rs232');
  });
});

test('an ERROR of the plugin stage decodes', () => {
  assert.deepEqual(decodeServerFrame('ERROR plugin\nbad'), { verb: 'ERROR', stage: 'plugin', text: 'bad' });
});
