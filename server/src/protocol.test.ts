// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { decodeClientFrame, decodeServerFrame, encodeClientFrame, encodeServerFrame, parseRunHeader } from './protocol.js';

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

describe('OPTIONS', () => {
  test('carries the decoded compiler options', () => {
    assert.deepEqual(decodeClientFrame('OPTIONS\n{"ghdl":{"synopsys":true}}'), {
      verb: 'OPTIONS',
      options: { ok: true, options: { ghdl: { synopsys: true, relaxed: false }, iverilog: { defines: {} } } },
    });
  });

  test('decodes invalid options to the verb too, so the next RUN can say why', () => {
    assert.deepEqual(decodeClientFrame('OPTIONS\n{"ghdl":{"vpi":"x"}}'), {
      verb: 'OPTIONS',
      options: { ok: false, reason: 'Invalid compiler options: ghdl.vpi is not a known option' },
    });
  });

  test('refuses inline arguments', () => {
    assert.deepEqual(decodeClientFrame('OPTIONS x\n{}'), { verb: 'OPTIONS', options: { ok: false, reason: 'OPTIONS takes no inline arguments' } });
  });

  test('decode and encode round-trip', () => {
    const text = 'OPTIONS\n{"ghdl":{"synopsys":"auto","relaxed":true},"iverilog":{"generation":"2012","defines":{"W":"8"}}}';
    assert.equal(encodeClientFrame(decodeClientFrame(text) as Parameters<typeof encodeClientFrame>[0]), text);
  });
});

describe('a RUN frame that cannot be decoded', () => {
  test('is marked as a RUN, so its refusal ends the run', () => {
    assert.deepEqual(decodeClientFrame('RUN top.vhd\n'), { message: 'RUN body contains no @@FILE ...@@ sections', run: true });
  });
});

/** Protocol 8: the synthesis check beside a run (docs/impl_sim_only_warnings.md § 7). */
describe('SYNTH-CHECK', () => {
  test('carries a check number, a top and file names', () => {
    assert.deepEqual(decodeClientFrame('SYNTH-CHECK 3\n{"top":"counter","files":["counter.vhd","pkg.vhd"]}'), {
      verb: 'SYNTH-CHECK',
      id: 3,
      top: 'counter',
      files: ['counter.vhd', 'pkg.vhd'],
    });
  });

  test('round-trips', () => {
    const frame = { verb: 'SYNTH-CHECK', id: 12, top: 'blink', files: ['blink.v'] } as const;
    assert.deepEqual(decodeClientFrame(encodeClientFrame(frame)), frame);
  });

  test('names each file once', () => {
    const decoded = decodeClientFrame('SYNTH-CHECK 1\n{"top":"a","files":["a.vhd","a.vhd"]}');
    assert.deepEqual('files' in decoded && decoded.files, ['a.vhd']);
  });

  test('is a protocol error, not a refused RUN, when it is malformed', () => {
    for (const text of [
      'SYNTH-CHECK\n{"top":"a","files":["a.vhd"]}',
      'SYNTH-CHECK x\n{"top":"a","files":["a.vhd"]}',
      'SYNTH-CHECK 1\nnot json',
      'SYNTH-CHECK 1\n{"top":"-e","files":["a.vhd"]}',
      'SYNTH-CHECK 1\n{"top":"a b","files":["a.vhd"]}',
      'SYNTH-CHECK 1\n{"top":"a","files":[]}',
      'SYNTH-CHECK 1\n{"top":"a","files":[""]}',
      'SYNTH-CHECK 1\n{"top":"a","files":"a.vhd"}',
      'SYNTH-CHECK 1\nnull',
    ]) {
      const decoded = decodeClientFrame(text);
      assert.ok('message' in decoded, text);
      assert.equal('run' in decoded, false, text);
    }
  });
});

describe('SYNTH-RESULT', () => {
  test('round-trips an exit code with the tool text', () => {
    const frame = { verb: 'SYNTH-RESULT', id: 4, outcome: { kind: 'exit', code: 1 }, text: 'top.vhd:3:1:error: latch infered\nmore' } as const;
    assert.equal(encodeServerFrame(frame), 'SYNTH-RESULT 4 exit 1\ntop.vhd:3:1:error: latch infered\nmore');
    assert.deepEqual(decodeServerFrame(encodeServerFrame(frame)), frame);
  });

  test('round-trips every stop', () => {
    for (const kind of ['timeout', 'crash', 'unavailable', 'busy', 'skipped', 'refused'] as const) {
      const frame = { verb: 'SYNTH-RESULT', id: 9, outcome: { kind }, text: '' } as const;
      assert.deepEqual(decodeServerFrame(encodeServerFrame(frame)), frame);
    }
  });

  test('refuses an unknown outcome or a bad number', () => {
    for (const text of ['SYNTH-RESULT 1 melted', 'SYNTH-RESULT x exit 0', 'SYNTH-RESULT 1 exit', 'SYNTH-RESULT 1 exit -1', 'SYNTH-RESULT 1', 'SYNTH-RESULT 1 timeout 3']) {
      assert.ok('message' in decodeServerFrame(text), text);
    }
  });
});
