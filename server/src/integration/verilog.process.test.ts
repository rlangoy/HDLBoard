// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The compile side of the Verilog engine against real Icarus Verilog
 * (docs/Verilog_implementation_plan.md § 7.5, step D2): reading a top's ports, the
 * three kinds of compile outcome, and — closing step C5's done-when — that the
 * generated wrapper compiles clean for every board fixture.
 */

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { icarusForTests } from '../testSupport/icarus.js';
import { readFixture } from '../testSupport/fixture.js';
import { loadScenarios } from '../testSupport/scenarios.js';
import { AWKWARD_DIRECTORY_PREFIX, sessionFor } from '../testSupport/verilogSession.js';
import { TESTBENCH_FILE_NAME } from '../verilog/fileNames.js';
import { boardPortSpellings } from '../verilog/ports.js';
import { compileVerilog, readBanner, readTopPorts } from '../verilog/process.js';
import { buildBoardTestbench, TESTBENCH_MODULE_NAME } from '../verilog/testbench.js';

const { tools, skip } = icarusForTests();

const SYNTAX_ERROR = 'module bad(input a, output b);\n  assign b = a +;\nendmodule\n';
const UNKNOWN_MODULE = 'module top2(input a, output b);\n  missing_mod u(.x(a), .y(b));\nendmodule\n';
const WIDTH_MISMATCH = `module w(input [7:0] a, output [3:0] b);
  assign b = a[3:0];
endmodule

module tw;
  reg [3:0] x;
  wire [9:0] y;
  w u(.a(x), .b(y));
endmodule
`;

describe('Verilog process layer (real Icarus)', { skip }, () => {
  test('readBanner names a version', async (t) => {
    const banner = await readBanner(tools, sessionFor(t, {}));
    assert.match(banner, /^Icarus Verilog version 1[2-9]\./);
  });

  test('readTopPorts reads every port of a board design', async (t) => {
    const dir = sessionFor(t, { 'DE1_SoC.v': readFixture('verilog', 'DE1_SoC.v') });
    const outcome = await readTopPorts(tools, { dir, target: 'DE1_SoC', files: ['DE1_SoC.v'] });
    assert.ok(outcome.ok);
    assert.equal(outcome.ports.length, 10);
    assert.deepEqual(outcome.ports.find((port) => port.name === 'SW'), { name: 'SW', direction: 'input', width: 10 });
  });

  test('I-V2: a syntax error comes back as an analyze failure naming the file and line', async (t) => {
    const dir = sessionFor(t, { 'bad.v': SYNTAX_ERROR });
    const outcome = await readTopPorts(tools, { dir, target: 'bad', files: ['bad.v'] });
    assert.ok(!outcome.ok);
    assert.equal(outcome.failure.stage, 'analyze');
    assert.match(outcome.failure.text, /bad\.v:2:/);
  });

  test('I-V3: an unknown module comes back as an elaborate failure naming it', async (t) => {
    const dir = sessionFor(t, { 'top2.v': UNKNOWN_MODULE });
    const outcome = await readTopPorts(tools, { dir, target: 'top2', files: ['top2.v'] });
    assert.ok(!outcome.ok);
    assert.equal(outcome.failure.stage, 'elaborate');
    assert.match(outcome.failure.text, /missing_mod/);
  });

  test('I-V4: warnings on a successful compile are returned, not lost', async (t) => {
    const dir = sessionFor(t, { 'warn.v': WIDTH_MISMATCH });
    const outcome = await compileVerilog(tools, { dir, target: 'tw', files: ['warn.v'] });
    assert.ok(outcome.ok);
    assert.match(outcome.messages.join('\n'), /Port 2 \(b\) of module w expects 4 bit\(s\), given 10/);
  });

  test('a design that compiles clean returns no messages', async (t) => {
    const dir = sessionFor(t, { 'DE1_SoC.v': readFixture('verilog', 'DE1_SoC.v') });
    const outcome = await compileVerilog(tools, { dir, target: 'DE1_SoC', files: ['DE1_SoC.v'] });
    assert.deepEqual(outcome, { ok: true, messages: [] });
  });

  test('works in a directory whose name has a space and a non-ASCII letter (M11)', async (t) => {
    const dir = sessionFor(t, { 'DE1_SoC.v': readFixture('verilog', 'DE1_SoC.v') }, AWKWARD_DIRECTORY_PREFIX);
    const outcome = await readTopPorts(tools, { dir, target: 'DE1_SoC', files: ['DE1_SoC.v'] });
    assert.ok(outcome.ok);
  });

  test('reports a tool that is not installed instead of throwing', async (t) => {
    const dir = sessionFor(t, { 'DE1_SoC.v': readFixture('verilog', 'DE1_SoC.v') });
    const missing = { iverilog: join(dir, 'no-such-iverilog'), vvp: 'vvp' };
    const outcome = await readTopPorts(missing, { dir, target: 'DE1_SoC', files: ['DE1_SoC.v'] });
    assert.ok(!outcome.ok);
    assert.notEqual(outcome.failure.text, '');
  });

  describe('the generated wrapper compiles clean for every board fixture (closes step C5)', () => {
    const boardFixtures = loadScenarios().fixtures.filter((fixture) => fixture.mode === 'board' && fixture.files.verilog);
    for (const fixture of boardFixtures) {
      test(`${fixture.id} (top module ${fixture.top})`, async (t) => {
        const file = fixture.files.verilog as string;
        const dir = sessionFor(t, { [file]: readFixture('verilog', file) });

        const ports = await readTopPorts(tools, { dir, target: fixture.top, files: [file] });
        assert.ok(ports.ok);
        writeFileSync(join(dir, TESTBENCH_FILE_NAME), buildBoardTestbench(fixture.top, boardPortSpellings(ports.ports)));

        const compiled = await compileVerilog(tools, { dir, target: TESTBENCH_MODULE_NAME, files: [TESTBENCH_FILE_NAME, file] });
        assert.deepEqual(compiled, { ok: true, messages: [] });
      });
    }
  });

  test('the batch fixture compiles clean with its companion design', async (t) => {
    const files = { 'tb_counter8.v': readFixture('verilog', 'tb_counter8.v'), 'keyCouter2Led.v': readFixture('verilog', 'keyCouter2Led.v') };
    const dir = sessionFor(t, files);
    const compiled = await compileVerilog(tools, { dir, target: 'tb_counter8', files: ['keyCouter2Led.v', 'tb_counter8.v'] });
    assert.deepEqual(compiled, { ok: true, messages: [] });
  });
});
