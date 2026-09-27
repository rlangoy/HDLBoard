// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { languageOfFile, languageOfTopFile, mismatchedFiles, mismatchMessage } from './language.js';

describe('languageOfFile', () => {
  test('recognises Verilog sources and headers', () => {
    assert.equal(languageOfFile('top.v'), 'verilog');
    assert.equal(languageOfFile('defs.vh'), 'verilog');
  });

  test('recognises VHDL in both of its extensions', () => {
    assert.equal(languageOfFile('top.vhd'), 'vhdl');
    assert.equal(languageOfFile('top.vhdl'), 'vhdl');
  });

  test('ignores the case of the extension', () => {
    assert.equal(languageOfFile('TOP.V'), 'verilog');
    assert.equal(languageOfFile('TOP.VHDL'), 'vhdl');
  });

  test('says nothing about a file that is neither', () => {
    assert.equal(languageOfFile('notes.txt'), undefined);
    assert.equal(languageOfFile('Makefile'), undefined);
  });
});

describe('languageOfTopFile', () => {
  test('follows the extension of the top file', () => {
    assert.equal(languageOfTopFile('DE1_SoC.v'), 'verilog');
    assert.equal(languageOfTopFile('DE1_SoC.vhdl'), 'vhdl');
  });

  test('is VHDL when no top file is marked, as it has always been', () => {
    assert.equal(languageOfTopFile(undefined), 'vhdl');
  });

  test('is VHDL for a top file of no known language, leaving GHDL to say what is wrong', () => {
    assert.equal(languageOfTopFile('notes.txt'), 'vhdl');
  });
});

describe('mismatchedFiles', () => {
  const named = (...names: string[]) => names.map((name) => ({ name }));

  test('is empty when every file belongs to the run’s language', () => {
    assert.deepEqual(mismatchedFiles(named('a.v', 'b.vh'), 'verilog'), []);
  });

  test('lists the files that belong to the other language', () => {
    assert.deepEqual(mismatchedFiles(named('a.v', 'b.vhd', 'c.vhdl'), 'verilog'), ['b.vhd', 'c.vhdl']);
    assert.deepEqual(mismatchedFiles(named('a.vhd', 'b.v'), 'vhdl'), ['b.v']);
  });

  test('does not count a file of unknown language as a mismatch', () => {
    assert.deepEqual(mismatchedFiles(named('a.v', 'notes.txt'), 'verilog'), []);
  });
});

describe('mismatchMessage', () => {
  test('names the language, the top file and the offending files', () => {
    const text = mismatchMessage('verilog', 'top.v', ['b.vhd']);
    assert.match(text, /Verilog/);
    assert.match(text, /top\.v/);
    assert.match(text, /b\.vhd/);
  });

  test('says VHDL for a VHDL run', () => {
    assert.match(mismatchMessage('vhdl', 'top.vhd', ['x.v']), /VHDL/);
  });
});
