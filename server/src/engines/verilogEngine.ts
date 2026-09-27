// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The Verilog engine (docs/Verilog_implementation_plan.md § 5.4): Icarus Verilog behind
 * the same `SimEngine` seam as GHDL. Preparing a run is three steps — read the top's
 * ports from Icarus's own elaboration, generate the board wrapper from them, compile —
 * and a design that declares no board port skips the wrapper and runs as a standalone
 * testbench. Every failure is a value the session turns into an `ERROR` frame.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ErrorStage, VhdlFileInput } from '../protocol.js';
import { standaloneHint, versionWarning } from '../verilog/diagnostics.js';
import { SIMULATION_FILE_NAME, TESTBENCH_FILE_NAME, TIMESCALE_FILE_NAME, TIMESCALE_SOURCE, validateSourceName } from '../verilog/fileNames.js';
import { boardPortSpellings, chooseTopModule, isBoardDesign, moduleNames, type Port } from '../verilog/ports.js';
import { compileVerilog, readBanner, readTopPorts, type CompileRequest } from '../verilog/process.js';
import { startVerilogBatchRun, startVerilogBoardRun } from '../verilog/run.js';
import { buildBoardTestbench, TESTBENCH_MODULE_NAME } from '../verilog/testbench.js';
import { getToolPaths } from '../verilog/tools.js';
import type { ToolPaths } from '../verilog/toolPaths.js';
import { boardTimingFor, TIMING_WITHOUT_CLOCK_50 } from './boardTiming.js';
import type { PrepareRequest, PrepareResult, RunPlan, SimEngine } from './types.js';

const CLOCK_BOARD_NAME = 'clock_50';
/** Every platform paces through stdin: Verilog can block in `$fgets` on it, and there is no `mkfifo` on Windows. */
const PACING: RunPlan['pacing'] = 'stdin';

const failure = (stage: ErrorStage, text: string): PrepareResult => ({ ok: false, stage, text });

/** What the compile steps share: where, with which tools, and which module is the student's top. */
interface Build {
  readonly tools: ToolPaths;
  readonly dir: string;
  readonly top: string;
  /** The `.v` files to compile, in the order they were sent (headers are found through `-I`). */
  readonly sources: readonly string[];
  /** Simulator messages to show before the run: the version banner, then compiler warnings. */
  readonly notes: readonly string[];
}

type Checked =
  | { readonly ok: true; readonly top: string; readonly sources: readonly string[] }
  | { readonly ok: false; readonly stage: ErrorStage; readonly text: string };

/** Each name checked once: the first reason a name is unusable, or else the names of the `.v` sources. */
function checkNames(files: readonly VhdlFileInput[]): { readonly problem?: string; readonly sources: string[] } {
  const sources: string[] = [];
  for (const { name } of files) {
    const check = validateSourceName(name);
    if (!check.ok) return { problem: check.reason, sources };
    if (check.kind === 'source') sources.push(name);
  }
  return { sources };
}

/** The file names, the top file's presence and its module: everything decidable before Icarus runs. */
function checkProject(files: readonly VhdlFileInput[], topFile: string | undefined): Checked {
  const { problem, sources } = checkNames(files);
  if (problem !== undefined) return { ok: false, stage: 'analyze', text: problem };
  const top = files.find((file) => file.name === topFile);
  if (top === undefined) return { ok: false, stage: 'analyze', text: `Top file ${topFile ?? '(none)'} was not among the files sent.` };
  const choice = chooseTopModule(top.name, moduleNames(top.content));
  if (!choice.ok) return { ok: false, stage: 'elaborate', text: choice.reason };
  return { ok: true, top: choice.name, sources };
}

function writeProject(dir: string, files: readonly VhdlFileInput[]): void {
  writeFileSync(join(dir, TIMESCALE_FILE_NAME), TIMESCALE_SOURCE);
  for (const file of files) writeFileSync(join(dir, file.name), file.content);
}

const compileRequest = (build: Build, target: string, extraFiles: readonly string[] = []): CompileRequest => ({
  dir: build.dir,
  target,
  files: [...extraFiles, ...build.sources],
});

function batchPlan(build: Build, messages: readonly string[]): RunPlan {
  return { mode: 'batch', dir: build.dir, runTarget: build.top, timing: TIMING_WITHOUT_CLOCK_50, pacing: PACING, messages };
}

function boardPlan(build: Build, ports: readonly Port[], messages: readonly string[]): RunPlan {
  const timing = boardTimingFor(boardPortSpellings(ports).has(CLOCK_BOARD_NAME));
  return { mode: 'board', dir: build.dir, runTarget: SIMULATION_FILE_NAME, timing, pacing: PACING, messages };
}

/** A standalone testbench supplies its own stimuli: compile the student's top directly and run it. */
async function prepareBatch(build: Build, ports: readonly Port[]): Promise<PrepareResult> {
  const compiled = await compileVerilog(build.tools, compileRequest(build, build.top));
  if (!compiled.ok) return failure(compiled.failure.stage, compiled.failure.text);
  // A top with ports of its own but none of the board's is told why it is not a board design.
  const hint = ports.length > 0 ? [standaloneHint(build.top)] : [];
  return { ok: true, plan: batchPlan(build, [...build.notes, ...hint, ...compiled.messages]) };
}

/**
 * A design with board ports: wrap it in the generated testbench and compile that. The
 * top alone already compiled (its ports were just read), so a failure here is the
 * wrapper's — the student's code is not the likely cause.
 */
async function prepareBoard(build: Build, ports: readonly Port[]): Promise<PrepareResult> {
  writeFileSync(join(build.dir, TESTBENCH_FILE_NAME), buildBoardTestbench(build.top, boardPortSpellings(ports)));
  const compiled = await compileVerilog(build.tools, compileRequest(build, TESTBENCH_MODULE_NAME, [TESTBENCH_FILE_NAME]));
  if (compiled.ok) return { ok: true, plan: boardPlan(build, ports, [...build.notes, ...compiled.messages]) };
  const { stage, text } = compiled.failure;
  return stage === 'analyze' ? failure('internal', `Internal testbench build error:\n${text}`) : failure(stage, text);
}

/** The banner never changes for a given `iverilog`, so it is read once, not spawned on every run. */
const notesByCompiler = new Map<string, string[]>();

async function versionNotes(tools: ToolPaths, dir: string): Promise<string[]> {
  const known = notesByCompiler.get(tools.iverilog);
  if (known !== undefined) return known;
  const banner = await readBanner(tools, dir);
  const notes = [banner, versionWarning(banner)].filter((line): line is string => line !== undefined && line !== '');
  if (banner !== '') notesByCompiler.set(tools.iverilog, notes); // a failed read is tried again next run
  return notes;
}

async function prepare({ dir, files, topFile }: PrepareRequest): Promise<PrepareResult> {
  const checked = checkProject(files, topFile);
  if (!checked.ok) return failure(checked.stage, checked.text);
  writeProject(dir, files);

  const tools = getToolPaths();
  const build: Build = { tools, dir, top: checked.top, sources: checked.sources, notes: await versionNotes(tools, dir) };
  const ports = await readTopPorts(tools, compileRequest(build, build.top));
  if (!ports.ok) return failure(ports.failure.stage, ports.failure.text);
  return isBoardDesign(ports.ports) ? prepareBoard(build, ports.ports) : prepareBatch(build, ports.ports);
}

export const verilogEngine: SimEngine = {
  language: 'verilog',
  prepare,
  startBoardRun: (plan, files) => startVerilogBoardRun(getToolPaths(), { dir: plan.dir, files, timing: plan.timing }),
  startBatchRun: (plan, onOutput, timeoutMs) => startVerilogBatchRun(getToolPaths(), { dir: plan.dir, timeoutMs }, onOutput),
};
