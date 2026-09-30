// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseToolArgs } from './cliArgs.js';

const STRICT = { strict: true };
const LENIENT = { strict: false };

describe('parseToolArgs', () => {
  test('returns nothing for no arguments', () => {
    assert.deepEqual(parseToolArgs([], STRICT), { ok: true, args: {} });
  });

  test('reads every flag in the separate-value form', () => {
    const argv = ['--iverilog-dir', 'C:\\HDLBoard\\resources\\iverilog', '--ghdl-dir', 'C:\\HDLBoard\\resources\\ghdl', '--ghdl-exe', '/usr/bin/ghdl'];
    assert.deepEqual(parseToolArgs(argv, STRICT), {
      ok: true,
      args: { iverilogDir: 'C:\\HDLBoard\\resources\\iverilog', ghdlDir: 'C:\\HDLBoard\\resources\\ghdl', ghdlExe: '/usr/bin/ghdl' },
    });
  });

  test('reads the --flag=value form, keeping spaces and later = signs', () => {
    assert.deepEqual(parseToolArgs(['--iverilog-dir=C:\\Program Files\\a=b'], STRICT), {
      ok: true,
      args: { iverilogDir: 'C:\\Program Files\\a=b' },
    });
  });

  test('rejects an unknown argument when strict', () => {
    assert.deepEqual(parseToolArgs(['--iverilog-dri', 'x'], STRICT), { ok: false, error: 'unknown argument: --iverilog-dri' });
  });

  test('skips foreign arguments when lenient, as Electron argv carries them', () => {
    const argv = ['.', '--disable-gpu', '--ghdl-dir', 'D:\\ghdl', '--lang=en'];
    assert.deepEqual(parseToolArgs(argv, LENIENT), { ok: true, args: { ghdlDir: 'D:\\ghdl' } });
  });

  test('rejects a flag with no value, even when lenient', () => {
    assert.equal(parseToolArgs(['--ghdl-dir'], LENIENT).ok, false);
    assert.equal(parseToolArgs(['--ghdl-dir='], LENIENT).ok, false);
    assert.equal(parseToolArgs(['--ghdl-dir', '--iverilog-dir', 'x'], STRICT).ok, false);
  });
});
