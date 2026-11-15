// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { crashOf, explainingReport, failedRunText, readMemoryCapMb, reportOf, silentExitOf, type SimulatorReport } from './runFailure.js';

describe('reportOf', () => {
  /** Whether `line` is a report that stops the run, one that lets it go on, or no report. */
  const kindOf = (line: string) => {
    const report = reportOf(line, true);
    if (report === undefined) return 'none';
    return report.stops ? 'stops' : 'goes on';
  };

  test("GHDL's own error stops the run", () => {
    assert.equal(kindOf('ghdl:error: bound check failure at top.vhdl:19'), 'stops');
  });

  test('an installed GHDL on Windows, named by its path', () => {
    assert.equal(kindOf('C:\\Program Files\\HDLBoard\\resources\\ghdl\\bin\\ghdl.exe:error: index (5) out of bounds (0 to 3) at bound.vhdl:9'), 'stops');
  });

  test("Debian's ghdl-mcode", () => {
    assert.equal(kindOf('/usr/bin/ghdl-mcode:error: bound check failure at top.vhdl:19'), 'stops');
  });

  test("a design's own std.env.stop(1)", () => {
    assert.equal(kindOf('simulation stopped @5ns with status 1'), 'stops');
  });

  test("Icarus's $fatal stops the run", () => {
    assert.equal(kindOf('FATAL: top.v:1: boom 3'), 'stops');
  });

  test("Icarus's $fatal in a file whose name holds spaces", () => {
    assert.equal(kindOf('FATAL: my test.v:5: fatal reason'), 'stops');
  });

  test("Icarus's $error lets the run go on", () => {
    assert.equal(kindOf('ERROR: my test.v:3: mismatch'), 'goes on');
  });

  test('a student\'s own $display("ERROR: ...") has no place', () => {
    assert.equal(kindOf('ERROR: mismatch at 40'), 'none');
  });

  test("a design's own report text", () => {
    assert.equal(kindOf('top.vhdl:5:5:@0ms:(report note): an error occurred'), 'none');
  });
});

describe('explainingReport', () => {
  const error: SimulatorReport = { line: 'ERROR: top.v:3: mismatch', shown: true, stops: false };
  const fatal: SimulatorReport = { line: 'FATAL: top.v:9: boom', shown: false, stops: true };
  const failed: SimulatorReport = { line: 'ghdl:error: simulation failed', shown: true, stops: true };
  const boundCheck: SimulatorReport = { line: 'ghdl:error: bound check failure at top.vhdl:19', shown: true, stops: true };

  test('the first report explains the run so far', () => {
    assert.equal(explainingReport(null, error), error);
  });

  test('a $fatal after an $error is the reason', () => {
    assert.equal(explainingReport(error, fatal), fatal);
  });

  test("GHDL's own error stays the reason after its simulation failed", () => {
    assert.equal(explainingReport(boundCheck, failed), boundCheck);
  });

  test('a second $error does not replace the first', () => {
    assert.equal(explainingReport(error, { ...error, line: 'ERROR: top.v:4: again' }), error);
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
    assert.equal(failedRunText('', { line: 'FATAL: top.v:1: boom', shown: true, stops: true }, undefined), 'The simulation stopped as reported above.');
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
