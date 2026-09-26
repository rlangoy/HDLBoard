// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { RESERVED_FILE_NAMES, validateSourceName } from './fileNames.js';

const rejectionOf = (name: string): string => {
  const check = validateSourceName(name);
  assert.equal(check.ok, false, `${JSON.stringify(name)} should be rejected`);
  return check.ok ? '' : check.reason;
};

describe('validateSourceName', () => {
  test('accepts ordinary Verilog source names', () => {
    assert.deepEqual(validateSourceName('led.v'), { ok: true, kind: 'source' });
    assert.deepEqual(validateSourceName('Top_1.V'), { ok: true, kind: 'source' });
  });

  test('accepts a header file and tells it apart from a source file', () => {
    assert.deepEqual(validateSourceName('defs.vh'), { ok: true, kind: 'header' });
  });

  test('accepts a name with a space, since arguments are never joined into a shell string', () => {
    assert.equal(validateSourceName('my design.v').ok, true);
  });

  test('rejects the names the backend generates, in any letter case', () => {
    for (const reserved of RESERVED_FILE_NAMES) {
      assert.match(rejectionOf(reserved.toUpperCase()), /reserved|Verilog/);
    }
    assert.match(rejectionOf('hdl_board_tb.v'), /reserved/);
    assert.match(rejectionOf('HDL_BOARD_TB.V'), /reserved/);
    assert.match(rejectionOf('_hdlboard_ts.v'), /reserved/);
  });

  test('rejects a path, however it is written', () => {
    for (const name of ['../x.v', 'a/b.v', 'a\\b.v', 'C:\\x.v', '/x.v', 'C:x.v']) {
      assert.match(rejectionOf(name), /folder|path/);
    }
  });

  test('rejects a name that could be taken for a command-line option', () => {
    assert.match(rejectionOf('-x.v'), /start with/);
  });

  test('rejects an empty name and a name that is only an extension', () => {
    assert.match(rejectionOf(''), /empty/);
    assert.match(rejectionOf('.v'), /name/);
  });

  test('rejects control characters', () => {
    assert.match(rejectionOf('a\u0000b.v'), /control/);
    assert.match(rejectionOf('a\nb.v'), /control/);
  });

  test('rejects files that are not Verilog, VHDL included, saying what is accepted', () => {
    assert.match(rejectionOf('notes.txt'), /\.v/);
    assert.match(rejectionOf('design.vhd'), /Verilog/);
  });
});
