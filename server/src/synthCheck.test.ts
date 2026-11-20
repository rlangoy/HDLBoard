// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** The synthesis check's process layer: how a tool's end is reported, the slots, its folder. */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import type { CmdResult } from './runtime.js';
import { runSynthCheck, synthReportOf, SynthSlots, type SynthRun } from './synthCheck.js';

const result = (fields: Partial<CmdResult>): CmdResult => ({ code: 0, out: '', err: '', timedOut: false, signal: null, ...fields });

describe('synthReportOf', () => {
  test('is the exit code and stderr of a tool that ran', () => {
    const report = synthReportOf(result({ code: 1, err: 'top.vhd:4:5:error: latch infered for net "q"\n' }));
    assert.deepEqual(report, { outcome: { kind: 'exit', code: 1 }, text: 'top.vhd:4:5:error: latch infered for net "q"' });
  });

  test('puts stderr before stdout', () => {
    assert.equal(synthReportOf(result({ err: 'warning\n', out: 'list\n' })).text, 'warning\nlist');
  });

  test('is a timeout, whatever the killed tool said', () => {
    assert.deepEqual(synthReportOf(result({ code: -1, timedOut: true, signal: 'SIGKILL' })).outcome, { kind: 'timeout' });
  });

  test('is a crash on a signal, on an exit code from 128, and on a Windows status', () => {
    assert.deepEqual(synthReportOf(result({ code: -1, signal: 'SIGSEGV', err: 'error: Too many clocks' })).outcome, { kind: 'crash' });
    assert.deepEqual(synthReportOf(result({ code: 139 })).outcome, { kind: 'crash' });
    assert.deepEqual(synthReportOf(result({ code: 0xc0000005 })).outcome, { kind: 'crash' });
  });

  test('is unavailable for a tool that could not be started', () => {
    assert.deepEqual(synthReportOf(result({ code: -1, err: 'Error: spawn ghdl ENOENT' })).outcome, { kind: 'unavailable' });
  });

  test('is unavailable for a GHDL without synthesis and an Icarus without its null target', () => {
    assert.deepEqual(synthReportOf(result({ code: 1, err: "ghdl:error: unknown command '--synth', try 'help'" })).outcome, { kind: 'unavailable' });
    assert.deepEqual(synthReportOf(result({ code: 127, err: 'ERROR: Unable to read config file: …\\null-s.conf' })).outcome, { kind: 'unavailable' });
  });
});

describe('SynthSlots', () => {
  test('gives out as many slots as it has, and takes each back once', () => {
    const slots = new SynthSlots(1);
    const release = slots.take();
    assert.ok(release);
    assert.equal(slots.take(), undefined);
    release();
    release();
    const again = slots.take();
    assert.ok(again);
    assert.equal(slots.take(), undefined);
  });

  test('with none, every check is refused', () => {
    assert.equal(new SynthSlots(0).take(), undefined);
  });
});

describe('runSynthCheck', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hdl-board-synth-test-'));
  after(() => rmSync(dir, { recursive: true, force: true }));
  let nextId = 1;

  /** A check whose "tool" is Node running `script` in the check's folder. */
  const runOf = (script: string, fields: Partial<SynthRun> = {}): SynthRun => ({
    dir,
    id: nextId++,
    command: { cmd: process.execPath, args: ['-e', script], extraFiles: [{ name: 'extra.txt', content: 'generated' }] },
    files: [{ name: 'top.vhd', content: 'student code' }],
    timeoutMs: 10_000,
    signal: new AbortController().signal,
    ...fields,
  });

  test('runs in a folder holding the files and the generated ones', async () => {
    const script = "const fs=require('fs');console.error(fs.readFileSync('top.vhd','utf8')+'|'+fs.readFileSync('extra.txt','utf8'));process.exit(1)";
    const report = await runSynthCheck(runOf(script), new SynthSlots(1));
    assert.deepEqual(report, { outcome: { kind: 'exit', code: 1 }, text: 'student code|generated' });
  });

  test('removes its folder afterwards', async () => {
    const run = runOf('');
    await runSynthCheck(run, new SynthSlots(1));
    const folder = join(dir, `synth-${run.id}`);
    for (let i = 0; i < 50 && existsSync(folder); i++) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(existsSync(folder), false);
  });

  test('is busy when every slot is taken', async () => {
    assert.deepEqual(await runSynthCheck(runOf(''), new SynthSlots(0)), { outcome: { kind: 'busy' }, text: '' });
  });

  test('stops a tool that outlives its time', async () => {
    const report = await runSynthCheck(runOf('setTimeout(() => {}, 20000)', { timeoutMs: 200 }), new SynthSlots(1));
    assert.deepEqual(report?.outcome, { kind: 'timeout' });
  });

  test('says nothing when cancelled, and gives its slot back', async () => {
    const abort = new AbortController();
    const slots = new SynthSlots(1);
    const running = runSynthCheck(runOf('setTimeout(() => {}, 20000)', { signal: abort.signal }), slots);
    setTimeout(() => abort.abort(), 100);
    assert.equal(await running, undefined);
    assert.ok(slots.take());
  });
});
