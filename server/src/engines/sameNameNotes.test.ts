// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { sameNameNotes } from './sameNameNotes.js';

describe('sameNameNotes', () => {
  test('is empty when no other file declares the top file’s unit', () => {
    assert.deepEqual(sameNameNotes({ unitKind: 'entity', names: ['top'], topFile: 'top.vhd', otherFiles: [] }), []);
  });

  test('names the unit, both files and the one the run uses', () => {
    const notes = sameNameNotes({ unitKind: 'module', names: ['and_gate_tb'], topFile: 'mytest_tb.v', otherFiles: ['and_gate_tb.v'] });
    assert.deepEqual(notes, [
      'Note: and_gate_tb is declared in mytest_tb.v and in and_gate_tb.v. This run uses the one in mytest_tb.v; ' +
        'give each its own module name to keep them apart.',
    ]);
  });

  test('lists several units and files', () => {
    const [note] = sameNameNotes({ unitKind: 'module', names: ['a', 'b'], topFile: 'top.v', otherFiles: ['x.v', 'y.v'] });
    assert.match(note ?? '', /^Note: a, b are declared in top\.v and in x\.v, y\.v\./);
  });
});
