// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The GHDL engine: everything `Session.handleRun` used to do that is specific to GHDL
 * — analysing the project, finding the top entity, generating and elaborating the
 * board testbench, and starting the run — moved behind `SimEngine`
 * (docs/Verilog_implementation_plan.md § 5.7, step E2). The logic is moved, not
 * rewritten: each stage does what it did, and the characterization tests pin it.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getGhdlExe, runBatch, startPersistentRun } from '../ghdl.js';
import { findTopEntity, type TopEntity } from '../portDetect.js';
import type { ErrorStage, VhdlFileInput } from '../protocol.js';
import { runCommand, type CmdResult } from '../runtime.js';
import { generateTestbench } from '../tbTemplate.js';
import { boardTimingFor, TIMING_WITHOUT_CLOCK_50 } from './boardTiming.js';
import type { BoardFiles, BoardTiming, PrepareRequest, PrepareResult, RunPlan, SimEngine } from './types.js';

const TB_ENTITY = 'hdl_board_tb';
const GHDL_STANDARD = '--std=08';
const GHDL_BANNER = 'GHDL 5.0.1 (mcode)';

/**
 * Where the testbench's real-time pacing grants come from on this platform. Windows has
 * no `mkfifo` and Node's `fs` no `O_NONBLOCK`, so it paces through stdin; POSIX keeps
 * the FIFO (docs/ghdl_implementation_plan.md § 5.13, § 5.15).
 */
const PACING: RunPlan['pacing'] = process.platform === 'win32' ? 'stdin' : 'fifo';

/** `ghdl -a` / `-e` are expected to finish in seconds, so they run under the shared build timeout (§ 7.4). */
const ghdl = (args: string[], dir: string): Promise<CmdResult> => runCommand({ cmd: getGhdlExe(), args, cwd: dir });

const failure = (stage: ErrorStage, text: string): PrepareResult => ({ ok: false, stage, text });

/** The error text if `ghdl -a` rejects the file, `undefined` if it is analysed. */
async function analyzeFile(dir: string, name: string): Promise<string | undefined> {
  const result = await ghdl(['-a', GHDL_STANDARD, name], dir);
  if (result.code === 0) return undefined;
  if (result.timedOut) return `Analysis of ${name} timed out.\n${result.err}`;
  return result.err || `ghdl -a failed on ${name} with no output.`;
}

/**
 * Files are analysed to a fixed point rather than strictly in the order submitted: a
 * `RUN`'s files are not guaranteed top-entity-last (§ 6.3), so a project whose top
 * entity instantiates a component declared in a file that happens to arrive first
 * would otherwise fail with a spurious "unit not found in library work". Each pass
 * analyses whatever is still pending; a pass that analyses nothing new means the
 * remaining failures are real, not just waiting on an unanalysed dependency.
 *
 * Returns the errors of the files that never analysed, or `undefined` when all did.
 */
async function analyzeToFixedPoint(dir: string, files: readonly VhdlFileInput[]): Promise<string | undefined> {
  let pending = files.map((file) => file.name);
  const lastErrors = new Map<string, string>();
  while (pending.length > 0) {
    const stillFailing: string[] = [];
    for (const name of pending) {
      const error = await analyzeFile(dir, name);
      if (error !== undefined) {
        lastErrors.set(name, error);
        stillFailing.push(name);
      }
    }
    if (stillFailing.length === pending.length) return stillFailing.map((name) => lastErrors.get(name)).join('\n');
    pending = stillFailing;
  }
  return undefined;
}

/** A standalone testbench supplies its own stimuli, so its polling timing is never used. */
function batchPlan(dir: string, entityName: string): RunPlan {
  return { mode: 'batch', dir, runTarget: entityName, timing: TIMING_WITHOUT_CLOCK_50, pacing: PACING, messages: [] };
}

function boardPlan(dir: string, timing: BoardTiming): RunPlan {
  return { mode: 'board', dir, runTarget: TB_ENTITY, timing, pacing: PACING, messages: [GHDL_BANNER] };
}

/** A genuinely portless entity: no wrapper, run directly (see `runBatch`'s own doc comment). */
async function prepareBatch(dir: string, entityName: string): Promise<PrepareResult> {
  const elaborated = await ghdl(['-e', GHDL_STANDARD, entityName], dir);
  if (elaborated.code !== 0) return failure('elaborate', elaborated.err);
  return { ok: true, plan: batchPlan(dir, entityName) };
}

/** A design with board ports: wrap it in the generated testbench, then elaborate that. */
async function prepareBoard(dir: string, top: TopEntity): Promise<PrepareResult> {
  writeFileSync(join(dir, `${TB_ENTITY}.vhdl`), generateTestbench(top.name, top.ports, { pacingFromStdin: PACING === 'stdin' }));

  const analyzed = await ghdl(['-a', GHDL_STANDARD, `${TB_ENTITY}.vhdl`], dir);
  if (analyzed.code !== 0) return failure('internal', `Internal testbench build error:\n${analyzed.err}`);

  const elaborated = await ghdl(['-e', GHDL_STANDARD, TB_ENTITY], dir);
  if (elaborated.code !== 0) {
    return failure(
      'elaborate',
      `GHDL elaboration error (check that your entity's port names match the board's — ` +
        `CLOCK_50, SW, KEY, LEDR, HEX0..HEX5):\n${elaborated.err}`,
    );
  }

  // The same condition `tbTemplate.ts` uses to decide whether `clkgen` exists (§ 5.8),
  // which is what decides how fast simulated time runs, and so how finely to poll.
  const timing = boardTimingFor(top.ports.has('clock_50'));
  return { ok: true, plan: boardPlan(dir, timing) };
}

async function prepare({ dir, files, topFile }: PrepareRequest): Promise<PrepareResult> {
  for (const file of files) writeFileSync(join(dir, file.name), file.content);

  // Every file is analysed before our own port scan, so a genuine syntax error gets
  // GHDL's real diagnosis under `analyze` instead of being intercepted early by
  // `findTopEntity`'s regex heuristic, which runs on source not yet known to be VHDL.
  const analysisErrors = await analyzeToFixedPoint(dir, files);
  if (analysisErrors !== undefined) return failure('analyze', analysisErrors);

  const top = findTopEntity([...files], topFile);
  if ('message' in top) return failure('elaborate', top.message);
  return top.ports.size === 0 ? prepareBatch(dir, top.name) : prepareBoard(dir, top);
}

/** File names arrive relative to the session directory; GHDL has always been given absolute paths. */
function startBoardRun(plan: RunPlan, files: BoardFiles) {
  const absolute = (name: string) => join(plan.dir, name);
  return startPersistentRun(
    plan.dir,
    plan.runTarget,
    absolute(files.input),
    absolute(files.output),
    plan.timing.pollIntervalNs,
    plan.timing.minDwellNs,
    absolute(files.heartbeat),
    // Empty when there is no FIFO (stdin pacing): see `startPersistentRun`.
    files.pacing === undefined ? '' : absolute(files.pacing),
  );
}

export const ghdlEngine: SimEngine = {
  language: 'vhdl',
  prepare,
  startBoardRun,
  startBatchRun: (plan, onOutput, timeoutMs) => runBatch(plan.dir, plan.runTarget, onOutput, timeoutMs),
};
