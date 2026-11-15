// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { crashOf, failedRunText, isSimulatorReport, readMemoryCapMb, silentExitOf } from './runFailure.js';

describe('isSimulatorReport', () => {
  test("GHDL's own error", () => {
    assert.equal(isSimulatorReport('ghdl:error: bound check failure at top.vhdl:19'), true);
  });

  test('an installed GHDL on Windows, named by its path', () => {
    const line = 'C:\\Program Files\\HDLBoard\\resources\\ghdl\\bin\\ghdl.exe:error: index (5) out of bounds (0 to 3) at bound.vhdl:9';
    assert.equal(isSimulatorReport(line), true);
  });

  test("Debian's ghdl-mcode", () => {
    assert.equal(isSimulatorReport('/usr/bin/ghdl-mcode:error: bound check failure at top.vhdl:19'), true);
  });

  test("a design's own std.env.stop(1)", () => {
    assert.equal(isSimulatorReport('simulation stopped @5ns with status 1'), true);
  });

  test("Icarus's $fatal, with its place", () => {
    assert.equal(isSimulatorReport('FATAL: top.v:1: boom 3'), true);
  });

  test('a student\'s own $display("ERROR: ...") has no place', () => {
    assert.equal(isSimulatorReport('ERROR: mismatch at 40'), false);
  });

  test("a design's own report text", () => {
    assert.equal(isSimulatorReport('top.vhdl:5:5:@0ms:(report note): an error occurred'), false);
  });
});

describe('crashOf', () => {
  const exit = (code: number | null, stderr: string, signal: NodeJS.Signals | null = null) => crashOf({ code, stderr, signal });

  test('a signal is a crash', () => {
    assert.equal(exit(null, '', 'SIGBUS'), 'crashed on SIGBUS');
  });

  test('an exit code from 128 up is a signal a shell reported', () => {
    assert.equal(exit(139, ''), 'crashed with exit code 139');
  });

  test('a Windows status reads as hex: an access violation is 0xC0000005', () => {
    assert.equal(exit(3221225477, ''), 'crashed with exit code 0xC0000005');
  });

  test('stderr naming a crash is one, whatever the exit code', () => {
    assert.equal(exit(1, 'std::bad_alloc'), 'crashed with exit code 1: std::bad_alloc');
  });

  test('an ordinary error on stderr is no crash', () => {
    assert.equal(exit(1, 'vvp: Unable to open input file.'), undefined);
  });

  test('a silent failure is no crash', () => {
    assert.equal(exit(1, ''), undefined);
  });

  test('quotes one printable line, so stderr cannot write lines into the log', () => {
    assert.equal(exit(null, 'Segmentation fault\u001b[31m\nhdl-board: fake', 'SIGSEGV'), 'crashed on SIGSEGV: Segmentation fault?[31m');
  });

  test('a Windows stderr keeps no carriage return in the log', () => {
    assert.equal(exit(3221225477, 'Segmentation fault\r\n(core dumped)'), 'crashed with exit code 0xC0000005: Segmentation fault');
  });
});

describe('silentExitOf', () => {
  test('an exit with no word at all', () => {
    assert.equal(silentExitOf({ code: 1, stderr: '', signal: null }), 'exited with exit code 1 and no message');
  });

  test('no exit code reads as a sentence', () => {
    assert.equal(silentExitOf({ code: null, stderr: '', signal: null }), 'exited with no exit code and no message');
  });

  test('stderr says why: not silent', () => {
    assert.equal(silentExitOf({ code: 1, stderr: 'vvp: Unable to open input file.', signal: null }), undefined);
  });
});

describe('failedRunText', () => {
  test('without a cap, an unexplained exit is only that', () => {
    assert.equal(failedRunText('', null, undefined), 'Simulation exited unexpectedly.');
  });

  test('a report the student saw is pointed at', () => {
    assert.equal(failedRunText('', { line: 'FATAL: top.v:1: boom', shown: true }, undefined), 'The simulation stopped as reported above.');
  });
});

describe('readMemoryCapMb', () => {
  test('a whole number of MB', () => {
    assert.equal(readMemoryCapMb({ HDLBOARD_SIM_MEMORY_MB: ' 96 ' }), 96);
  });

  test('anything else is no cap: 96M', () => {
    assert.equal(readMemoryCapMb({ HDLBOARD_SIM_MEMORY_MB: '96M' }), undefined);
  });

  test('unset is no cap', () => {
    assert.equal(readMemoryCapMb({}), undefined);
  });
});
