// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { decodeCompilerOptions, DEFAULT_COMPILER_OPTIONS, encodeCompilerOptions, type CompilerOptions } from './compilerOptions.js';

const decoded = (value: unknown) => decodeCompilerOptions(JSON.stringify(value));

function reasonFor(value: unknown): string {
  const result = decoded(value);
  return result.ok ? 'accepted' : result.reason;
}

describe('decodeCompilerOptions', () => {
  test('reads an empty object as the defaults', () => {
    assert.deepEqual(decoded({}), { ok: true, options: DEFAULT_COMPILER_OPTIONS });
  });

  test('defaults to synopsys auto: legacy designs compile without a project file change', () => {
    assert.equal(DEFAULT_COMPILER_OPTIONS.ghdl.synopsys, 'auto');
  });

  test('reads every option', () => {
    const options: CompilerOptions = {
      ghdl: { synopsys: true, relaxed: true },
      iverilog: { generation: '2012', defines: { WIDTH: '8', SIM: '' } },
    };
    assert.deepEqual(decoded(options), { ok: true, options });
  });

  test('fills an option left out with its default', () => {
    assert.deepEqual(decoded({ ghdl: { relaxed: true } }), {
      ok: true,
      options: { ...DEFAULT_COMPILER_OPTIONS, ghdl: { synopsys: 'auto', relaxed: true } },
    });
  });

  test('round-trips through its encoding', () => {
    const options: CompilerOptions = { ghdl: { synopsys: false, relaxed: false }, iverilog: { generation: '2005', defines: { N: '4' } } };
    assert.deepEqual(decodeCompilerOptions(encodeCompilerOptions(options)), { ok: true, options });
  });

  test('refuses a body that is not JSON', () => {
    assert.equal(decodeCompilerOptions('{').ok, false);
  });

  test('refuses an unknown tool, naming it', () => {
    assert.match(reasonFor({ nvc: {} }), /compilerOptions\.nvc is not a known option/);
  });

  test('refuses an unknown option, naming it: a raw flag cannot be smuggled in', () => {
    assert.match(reasonFor({ ghdl: { flags: ['--vpi=evil.dll'] } }), /ghdl\.flags is not a known option/);
  });

  test('refuses a synopsys value that is not auto, true or false', () => {
    assert.match(reasonFor({ ghdl: { synopsys: 'yes' } }), /ghdl\.synopsys must be one of "auto", true, false/);
  });

  test('refuses an unknown Verilog generation', () => {
    assert.match(reasonFor({ iverilog: { generation: '1995' } }), /iverilog\.generation must be one of/);
  });

  test('refuses a macro name that is not an identifier', () => {
    assert.match(reasonFor({ iverilog: { defines: { 'A B': '1' } } }), /"A B" is not a macro name/);
  });

  test('refuses a macro value with a backtick, which could hold a compiler directive', () => {
    assert.match(reasonFor({ iverilog: { defines: { X: '`include "x.v"' } } }), /iverilog\.defines\.X must be text/);
  });

  test('refuses a macro value that is not text', () => {
    assert.match(reasonFor({ iverilog: { defines: { X: 8 } } }), /iverilog\.defines\.X must be text/);
  });

  test('says the reason comes from the compiler options', () => {
    assert.match(reasonFor([]), /^Invalid compiler options: compilerOptions must be an object$/);
  });
});
