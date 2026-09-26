// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Running compiled Verilog through real `vvp` (docs/Verilog_implementation_plan.md
 * § 7.5, steps D3 and D4): the persistent board run's file protocol and pacing, output
 * that arrives while the design is still running, a design ending the run itself, and
 * the standalone batch run with its timeout.
 */

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test, type TestContext } from 'node:test';
import { icarusForTests } from '../testSupport/icarus.js';
import { readFixture } from '../testSupport/fixture.js';
import { countProcesses, waitForProcessCount } from '../testSupport/processCount.js';
import { compiledBoardSession, sessionFor } from '../testSupport/verilogSession.js';
import { compileVerilog } from '../verilog/process.js';
import { startVerilogBatchRun, startVerilogBoardRun } from '../verilog/run.js';
import type { BoardFiles, BoardTiming } from '../engines/types.js';
import type { RunHandle } from '../runtime.js';

const { tools, skip } = icarusForTests();

const FILES: BoardFiles = { input: 'input.txt', output: 'output.txt', heartbeat: 'heartbeat-1.txt' };
const CLOCK_50_TIMING: BoardTiming = { pollIntervalNs: 10_000, minDwellNs: 10_000 };
const CLOCKLESS_TIMING: BoardTiming = { pollIntervalNs: 1_000_000, minDwellNs: 4_000_000 };

const UNBUFFERED_OUTPUT_WITHIN_MS = 1_000;
const RUN_TIMEOUT_MS = 8_000;
const BATCH_TIMEOUT_MS = 500;
const POLL_MS = 20;
const GRANTS = 100;
const SWITCHES_AND_KEYS = '10101010101111';
const LEDS_FOR_THOSE_SWITCHES = '1010101010';
const ALL_DISPLAYS_BLANK = '1'.repeat(42);

const SAYS_HI = `module hello(input [9:0] SW, output [9:0] LEDR);
  assign LEDR = SW;
  initial $display("design says hi");
endmodule
`;
const FINISHES = `module fin(input [9:0] SW, output [9:0] LEDR);
  assign LEDR = SW;
  initial begin #1000 $display("bye"); $finish; end
endmodule
`;
const STOPS = `module stopper(input [9:0] SW, output [9:0] LEDR);
  assign LEDR = SW;
  initial begin #1000 $stop; end
endmodule
`;
/** Spins the CPU forever with no delay. (Icarus refuses a zero-delay `always` at compile time, but not this.) */
const SPINS_FOREVER = 'module runaway; reg c = 0; initial forever c = ~c; endmodule\n';
/** A testbench that forgot `$finish`: its clock keeps the simulation alive for ever. */
const FORGOT_FINISH = 'module runaway; reg c = 0; always #5 c = ~c; endmodule\n';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Resolves with the first value delivered, or rejects saying what was awaited. */
function within<T>(what: string, ms: number, register: (deliver: (value: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} did not happen within ${ms} ms`)), ms);
    register((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

/** The exit code, once the run ends by itself or after a kill. */
const exitOf = (run: RunHandle) => within<number | null>('the run to exit', RUN_TIMEOUT_MS, (deliver) => run.onExit((code) => deliver(code)));

async function readStateFile(dir: string, matches: (line: string) => boolean): Promise<string> {
  const deadline = Date.now() + RUN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await wait(POLL_MS);
    try {
      // The testbench writes the file with the platform's line ending, so trim as `pollOutput` does.
      const line = (readFileSync(join(dir, FILES.output), 'utf8').split('\n')[0] ?? '').trim();
      if (matches(line)) return line;
    } catch {
      // Not written yet, or caught mid-rewrite: try again.
    }
  }
  throw new Error(`${FILES.output} never reached the expected state`);
}

/**
 * Runs `body` against a started board run and always kills it and waits for it to
 * exit afterwards — before any cleanup hook, because Windows will not delete the
 * session directory while `vvp` still has it as its working directory.
 */
async function withBoardRun(
  dir: string,
  timing: BoardTiming,
  body: (run: RunHandle, exited: Promise<number | null>) => Promise<void>,
): Promise<void> {
  const run = startVerilogBoardRun(tools, { dir, files: FILES, timing });
  const exited = exitOf(run);
  try {
    await body(run, exited);
  } finally {
    run.kill();
    await exited.catch(() => undefined);
  }
}

describe('Verilog persistent board run (real vvp)', { skip }, () => {
  test('applies a queued input, and publishes the state that produces', async (t) => {
    const dir = await compiledBoardSession(t, { tools, files: { 'DE1_SoC.v': readFixture('verilog', 'DE1_SoC.v') }, top: 'DE1_SoC' });
    writeFileSync(join(dir, FILES.input), `1 ${SWITCHES_AND_KEYS}\n`);
    await withBoardRun(dir, CLOCK_50_TIMING, async (run) => {
      run.grantPacing(GRANTS);
      const state = await readStateFile(dir, (line) => line.endsWith(' 1'));
      assert.equal(state, `${LEDS_FOR_THOSE_SWITCHES}${ALL_DISPLAYS_BLANK} 1`);
    });
  });

  test('I-V7: a design’s $display reaches us while it is still running (unbuffered output)', async (t) => {
    const dir = await compiledBoardSession(t, { tools, files: { 'hello.v': SAYS_HI }, top: 'hello' });
    await withBoardRun(dir, CLOCKLESS_TIMING, async (run) => {
      let exited = false;
      run.onExit(() => (exited = true));
      const line = await within<string>('the design’s $display line', UNBUFFERED_OUTPUT_WITHIN_MS, (deliver) => run.onOutput(deliver));
      assert.equal(line, 'design says hi');
      assert.equal(exited, false, 'the design should still be running when its output arrives');
    });
  });

  test('I-V8: a design that calls $finish ends the run with exit code 0, which is reported', async (t) => {
    const dir = await compiledBoardSession(t, { tools, files: { 'fin.v': FINISHES }, top: 'fin' });
    await withBoardRun(dir, CLOCKLESS_TIMING, async (run, exited) => {
      const lines: string[] = [];
      run.onOutput((line) => lines.push(line));
      run.grantPacing(GRANTS);
      assert.equal(await exited, 0);
      assert.ok(lines.includes('bye'));
      assert.ok(lines.some((line) => /\$finish called at/.test(line)), 'the simulator’s own $finish message should be shown');
    });
  });

  test('I-V9: $stop ends the run cleanly instead of waiting at an interactive prompt', async (t) => {
    const dir = await compiledBoardSession(t, { tools, files: { 'stopper.v': STOPS }, top: 'stopper' });
    await withBoardRun(dir, CLOCKLESS_TIMING, async (run, exited) => {
      const lines: string[] = [];
      run.onOutput((line) => lines.push(line));
      run.grantPacing(GRANTS);
      assert.equal(await exited, 0);
      assert.ok(lines.some((line) => /\$stop called at/.test(line)));
    });
  });

  test('killing the run stops vvp, reports the exit, and leaves no process behind', async (t) => {
    const before = countProcesses('vvp');
    const dir = await compiledBoardSession(t, { tools, files: { 'hello.v': SAYS_HI }, top: 'hello' });
    await withBoardRun(dir, CLOCKLESS_TIMING, async (run) => {
      await within<string>('the design to start', UNBUFFERED_OUTPUT_WITHIN_MS, (deliver) => run.onOutput(deliver));
      assert.ok(countProcesses('vvp') > before, 'expected a vvp process while the run is alive');
    });
    await waitForProcessCount('vvp', before, RUN_TIMEOUT_MS);
  });
});

/** Compiles a standalone design and runs it in batch mode; whether the timeout had to stop it. */
async function timedOut(t: TestContext, source: string): Promise<boolean> {
  const dir = sessionFor(t, { 'runaway.v': source });
  const compiled = await compileVerilog(tools, { dir, target: 'runaway', files: ['runaway.v'] });
  assert.ok(compiled.ok);
  return (await startVerilogBatchRun(tools, { dir, timeoutMs: BATCH_TIMEOUT_MS }, () => {}).done).timedOut;
}

describe('Verilog batch run (real vvp)', { skip }, () => {
  test('runs a standalone testbench to its end, showing everything it printed', async (t) => {
    const files = { 'keyCouter2Led.v': readFixture('verilog', 'keyCouter2Led.v'), 'tb_counter8.v': readFixture('verilog', 'tb_counter8.v') };
    const dir = sessionFor(t, files);
    const compiled = await compileVerilog(tools, { dir, target: 'tb_counter8', files: Object.keys(files) });
    assert.ok(compiled.ok);
    const lines: string[] = [];
    const result = await startVerilogBatchRun(tools, { dir, timeoutMs: RUN_TIMEOUT_MS }, (line) => lines.push(line)).done;
    assert.deepEqual({ code: result.code, timedOut: result.timedOut }, { code: 0, timedOut: false });
    assert.ok(lines.includes('PASS'));
    assert.ok(lines.some((line) => /\$finish called at/.test(line)));
  });

  test('stops a design that spins forever with no delay, and says it timed out', async (t) => {
    assert.equal(await timedOut(t, SPINS_FOREVER), true);
  });

  test('stops a testbench that forgot $finish, and says it timed out', async (t) => {
    assert.equal(await timedOut(t, FORGOT_FINISH), true);
  });
});
