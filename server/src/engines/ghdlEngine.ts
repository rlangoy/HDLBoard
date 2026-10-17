// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The GHDL engine: everything `Session.handleRun` used to do that is specific to GHDL
 * — analysing the project, finding the top entity, generating and elaborating the
 * board testbench, and starting the run — moved behind `SimEngine`
 * (docs/Verilog_implementation_plan.md § 5.7, step E2). The logic is moved, not
 * rewritten: each stage does what it did, and the characterization tests pin it.
 */

import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getGhdlExe, runBatch, startPersistentRun } from '../ghdl.js';
import { findEntityNames, findTopEntity, type TopEntity } from '../portDetect.js';
import type { ErrorStage, VhdlFileInput } from '../protocol.js';
import { runCommand, type CmdResult } from '../runtime.js';
import { generateTestbench } from '../tbTemplate.js';
import { boardTimingFor, TIMING_WITHOUT_CLOCK_50 } from './boardTiming.js';
import { BOARD_INPUT_NAMES, BOARD_OUTPUT_NAMES } from './boardPorts.js';
import { explainUnconnectedPorts, planExtraPorts, type TopSource } from './extraPorts.js';
import { sameNameNotes } from './sameNameNotes.js';
import type { BoardFiles, BoardTiming, PlannedWave, PrepareRequest, PrepareResult, RunPlan, SimEngine, WaveRequest } from './types.js';
import type { WaveFormat } from '../protocol.js';

const TB_ENTITY = 'hdl_board_tb';
const GHDL_STANDARD = '--std=08';

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
function batchPlan(dir: string, entityName: string, messages: readonly string[]): RunPlan {
  return { mode: 'batch', dir, runTarget: entityName, timing: TIMING_WITHOUT_CLOCK_50, pacing: PACING, messages };
}

/** A batch run records a waveform when one was asked for (docs/waveform_viewer_spec.md § 7.3). */
function withWave(result: PrepareResult, wave: WaveRequest | undefined): PrepareResult {
  if (!result.ok || wave === undefined || result.plan.mode !== 'batch') return result;
  return { ok: true, plan: { ...result.plan, wave: { format: wave.vhdlFormat } } };
}

/** GHDL's option per waveform format (docs/waveform_viewer_spec.md § 7.3). Never `--vcd-4states`: U, W, L, H, - stay. */
const WAVE_OPTION: Readonly<Record<WaveFormat, string>> = { ghw: '--wave=', vcd: '--vcd=' };

/** The run options that record the waveform into `waveFile`, relative to the session directory. */
export function waveArguments(wave: PlannedWave | undefined, waveFile: string | undefined): string[] {
  return wave === undefined || waveFile === undefined ? [] : [`${WAVE_OPTION[wave.format]}${waveFile}`];
}

/** `messages`: the GHDL banner, a note on a same-named entity, then the warnings about extra ports. */
function boardPlan(dir: string, timing: BoardTiming, messages: readonly string[]): RunPlan {
  return { mode: 'board', dir, runTarget: TB_ENTITY, timing, pacing: PACING, messages };
}

/**
 * The first line of `ghdl --version` — "GHDL 6.0.0 (6.0.0.r0.ge589c69) [Dunoon edition]" —
 * so the console names the GHDL actually running (the Windows app ships 5.0.1, the
 * Docker image builds 6.0.0, a Linux host has whatever its distribution packages).
 * It never changes for a given executable, so it is read once; a failed read is
 * tried again on the next run rather than cached.
 */
const bannerByExe = new Map<string, string>();

async function ghdlBanner(dir: string): Promise<string | undefined> {
  const exe = getGhdlExe();
  const known = bannerByExe.get(exe);
  if (known !== undefined) return known;
  const result = await ghdl(['--version'], dir);
  const banner = result.code === 0 ? result.out.split(/\r?\n/)[0]?.trim() : undefined;
  if (!banner) return undefined;
  bannerByExe.set(exe, banner);
  return banner;
}

/** A genuinely portless entity: no wrapper, run directly (see `runBatch`'s own doc comment). */
async function prepareBatch(dir: string, entityName: string, notes: readonly string[]): Promise<PrepareResult> {
  const elaborated = await ghdl(['-e', GHDL_STANDARD, entityName], dir);
  if (elaborated.code !== 0) return failure('elaborate', elaborated.err);
  return { ok: true, plan: batchPlan(dir, entityName, notes) };
}

/** The top entity of a board run, with its file's text, where the testbench is built. */
interface BoardTop {
  readonly dir: string;
  readonly top: TopEntity;
  readonly topContent: string;
}

/** A design with board ports: wrap it in the generated testbench, then elaborate that. */
async function prepareBoard({ dir, top, topContent }: BoardTop, notes: readonly string[]): Promise<PrepareResult> {
  // Ports the board does not have: the testbench holds an extra input at 0 or leaves it
  // open (`extraPorts.ts`), and GHDL's error about an open one is moved onto its declaration.
  const source: TopSource = { fileName: top.fileName, content: topContent, entityName: top.name, ports: top.ports };
  const extraPorts = planExtraPorts(source);
  const testbench = generateTestbench(top.name, top.ports, {
    pacingFromStdin: PACING === 'stdin',
    tiedInputs: extraPorts.tiedInputs,
  });
  writeFileSync(join(dir, `${TB_ENTITY}.vhdl`), testbench);

  const analyzed = await ghdl(['-a', GHDL_STANDARD, `${TB_ENTITY}.vhdl`], dir);
  if (analyzed.code !== 0) {
    const explained = explainUnconnectedPorts(analyzed.err, source);
    if (explained !== undefined) return failure('elaborate', explained);
    return failure('internal', `Internal testbench build error:\n${analyzed.err}`);
  }

  const elaborated = await ghdl(['-e', GHDL_STANDARD, TB_ENTITY], dir);
  if (elaborated.code !== 0) {
    return failure(
      'elaborate',
      `GHDL elaboration error (check that your entity's port names match the board's — ` +
        `${[...BOARD_INPUT_NAMES, ...BOARD_OUTPUT_NAMES].join(', ')}):\n${elaborated.err}`,
    );
  }

  // The same condition `tbTemplate.ts` uses to decide whether `clkgen` exists (§ 5.8),
  // which is what decides how fast simulated time runs, and so how finely to poll.
  const timing = boardTimingFor(top.ports.has('clock_50'));
  const banner = await ghdlBanner(dir);
  const messages = [...(banner === undefined ? [] : [banner]), ...notes, ...extraPorts.warnings];
  return { ok: true, plan: boardPlan(dir, timing, messages) };
}

/**
 * The other files that declare an entity by the top's name — a testbench copied to a
 * new file that kept its entity name, say. VHDL names ignore case.
 */
function otherFilesDeclaring(files: readonly VhdlFileInput[], top: TopEntity): string[] {
  const sameName = (name: string) => name.toLowerCase() === top.name.toLowerCase();
  return files
    .filter((file) => file.name !== top.fileName && findEntityNames(file.content).some(sameName))
    .map((file) => file.name);
}

/** GHDL's library index files: `work-obj08.cf` for `--std=08`. */
const WORK_LIBRARY_FILE = /^work-obj\d*\.cf$/;

/**
 * Empties the session's work library, so every run analyses its files from scratch.
 * A session keeps its directory from run to run, and with the last run's library still
 * there a testbench sent before its design was analysed against the old design, which
 * the new one then made obsolete: `architecture "sim" of "adder4_tb" is obsoleted by
 * entity "adder4"`. A file deleted from the project would also have stayed analysed.
 */
function clearWorkLibrary(dir: string): void {
  for (const name of readdirSync(dir)) {
    if (WORK_LIBRARY_FILE.test(name)) rmSync(join(dir, name), { force: true });
  }
}

/** A fresh session directory: no library of an earlier run, then this run's files. */
function writeSources(dir: string, files: readonly VhdlFileInput[]): void {
  clearWorkLibrary(dir);
  for (const file of files) writeFileSync(join(dir, file.name), file.content);
}

async function prepare(request: PrepareRequest): Promise<PrepareResult> {
  writeSources(request.dir, request.files);
  return prepareAnalysed(request);
}

/** Analyses the student's files, then decides how the top runs. */
async function prepareAnalysed({ dir, files, topFile, runTarget, wave }: PrepareRequest): Promise<PrepareResult> {
  // Every file is analysed before our own port scan, so a genuine syntax error gets
  // GHDL's real diagnosis under `analyze` instead of being intercepted early by
  // `findTopEntity`'s regex heuristic, which runs on source not yet known to be VHDL.
  const analysisErrors = await analyzeToFixedPoint(dir, files);
  if (analysisErrors !== undefined) return failure('analyze', analysisErrors);

  const top = findTopEntity([...files], topFile, runTarget);
  if ('message' in top) return failure('elaborate', top.message);

  // The library holds whichever same-named entity was analysed last: analysing the top's
  // file once more makes its own entity the one that is elaborated and run.
  const others = otherFilesDeclaring(files, top);
  const reanalysisError = others.length > 0 ? await analyzeFile(dir, top.fileName) : undefined;
  if (reanalysisError !== undefined) return failure('analyze', reanalysisError);
  const notes = sameNameNotes({ unitKind: 'entity', names: [top.name], topFile: top.fileName, otherFiles: others });

  if (top.ports.size === 0) return withWave(await prepareBatch(dir, top.name, notes), wave);
  const topContent = files.find((file) => file.name === top.fileName)?.content ?? '';
  return prepareBoard({ dir, top, topContent }, notes);
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
  startBatchRun: (plan, { onOutput, timeoutMs, waveFile }) =>
    runBatch(plan.dir, plan.runTarget, onOutput, timeoutMs, waveArguments(plan.wave, waveFile)),
};
