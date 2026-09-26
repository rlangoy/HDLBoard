// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { classifyCompileFailure, extractBanner, parseVersion, standaloneHint, versionWarning } from './diagnostics.js';

const BANNER_13 = 'Icarus Verilog version 13.0 (stable) (v13_0)';
const BANNER_12 = 'Icarus Verilog version 12.0 (stable) ()';

describe('classifyCompileFailure', () => {
  test('reports a syntax error as an analyze error, keeping the compiler text', () => {
    const stderr = 'syntax.v:2: syntax error\nsyntax.v:2: error: Syntax error in continuous assignment\n';
    assert.deepEqual(classifyCompileFailure(stderr, 2), { stage: 'analyze', text: stderr.trim() });
  });

  test('reports errors counted "during elaboration" as an elaborate error', () => {
    const stderr = 'unk.v:2: error: Unknown module type: missing_mod\n2 error(s) during elaboration.\n';
    assert.equal(classifyCompileFailure(stderr, 2).stage, 'elaborate');
  });

  test('reports a missing root module as an elaborate error', () => {
    const stderr = 'error: Unable to find the root module "Top" in the Verilog source.\n';
    assert.equal(classifyCompileFailure(stderr, 1).stage, 'elaborate');
  });

  test('says so, rather than showing nothing, when the compiler failed silently', () => {
    const failure = classifyCompileFailure('', 2);
    assert.equal(failure.stage, 'analyze');
    assert.match(failure.text, /exit code 2/);
  });

  test('trims surrounding blank lines from the compiler text', () => {
    assert.equal(classifyCompileFailure('\n\nx.v:1: syntax error\n\n', 2).text, 'x.v:1: syntax error');
  });
});

describe('classifyCompileFailure — simulator missing', () => {
  test('a program that cannot be started is an internal error that says how to fix it', () => {
    const failure = classifyCompileFailure('Error: spawn iverilog ENOENT', -2);
    assert.equal(failure.stage, 'internal');
    assert.match(failure.text, /Icarus Verilog .* not found/);
    assert.match(failure.text, /IVERILOG_DIR/);
  });
});

describe('extractBanner', () => {
  test('takes the first line of the version output verbatim', () => {
    const output = `${BANNER_13}\n\nCopyright (c) 2000-2026 Stephen Williams (steve@icarus.com)\n`;
    assert.equal(extractBanner(output), BANNER_13);
  });

  test('copes with Windows line endings', () => {
    assert.equal(extractBanner(`${BANNER_13}\r\n\r\nCopyright`), BANNER_13);
  });

  test('returns an empty string for empty output', () => {
    assert.equal(extractBanner(''), '');
  });
});

describe('parseVersion', () => {
  test('reads the major and minor version from a stable banner', () => {
    assert.deepEqual(parseVersion(BANNER_13), { major: 13, minor: 0 });
    assert.deepEqual(parseVersion(BANNER_12), { major: 12, minor: 0 });
  });

  test('reads a development snapshot banner', () => {
    assert.deepEqual(parseVersion('Icarus Verilog version 14.0 (devel) (s20260804)'), { major: 14, minor: 0 });
  });

  test('returns undefined for a line that is not a version banner', () => {
    assert.equal(parseVersion('command not found'), undefined);
    assert.equal(parseVersion(''), undefined);
  });
});

describe('versionWarning', () => {
  test('is silent for the tested versions 13.0 and 12.0', () => {
    assert.equal(versionWarning(BANNER_13), undefined);
    assert.equal(versionWarning(BANNER_12), undefined);
  });

  test('warns, naming the version and the tested ones, for a version outside them', () => {
    const warning = versionWarning('Icarus Verilog version 14.0 (devel) (s20260804)');
    assert.match(warning ?? '', /Icarus Verilog 14\.0 has not been tested/);
    assert.match(warning ?? '', /tested: 12\.x, 13\.x/);
  });

  test('warns for an older version too', () => {
    assert.match(versionWarning('Icarus Verilog version 11.0 (stable) (v11_0)') ?? '', /11\.0/);
  });

  test('warns, without throwing, when the version cannot be read', () => {
    assert.match(versionWarning('garbage') ?? '', /Could not read the Icarus Verilog version/);
  });
});

describe('standaloneHint', () => {
  test('names the module and the ports a board design must declare', () => {
    const hint = standaloneHint('leds');
    assert.match(hint, /'leds'/);
    assert.match(hint, /CLOCK_50.*SW.*KEY_N.*LEDR.*HEX0_N/);
  });
});
