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
import { findOwnDump } from '../verilog/dumpDetection.js';
import { OWN_DUMP_MISSING_MESSAGE } from '../wave/waveConsole.js';
import { WAVE_MODULE_FILE_NAME, WAVE_MODULE_NAME, waveModuleSource, wavePlusarg } from '../verilog/waveModule.js';
import type { ToolPaths } from '../verilog/toolPaths.js';
import { boardTimingFor, TIMING_WITHOUT_CLOCK_50 } from './boardTiming.js';
import { sameNameNotes, type SameNameDeclarations } from './sameNameNotes.js';
import type { BoardIo } from './boardPorts.js';
import type { PlannedWave, PrepareRequest, PrepareResult, RunPlan, SimEngine } from './types.js';

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
  /** The port names the design is matched against and the wrapper connects by. */
  readonly board: BoardIo;
}

type Checked =
  | { readonly ok: true; readonly topFile: string; readonly top: string; readonly sources: readonly string[] }
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
function checkProject(files: readonly VhdlFileInput[], topFile: string | undefined, runTarget?: string): Checked {
  const { problem, sources } = checkNames(files);
  if (problem !== undefined) return { ok: false, stage: 'analyze', text: problem };
  const top = files.find((file) => file.name === topFile);
  if (top === undefined) return { ok: false, stage: 'analyze', text: `Top file ${topFile ?? '(none)'} was not among the files sent.` };
  const choice = chooseTopModule(top.name, moduleNames(top.content), runTarget);
  if (!choice.ok) return { ok: false, stage: 'elaborate', text: choice.reason };
  return { ok: true, topFile: top.name, top: choice.name, sources };
}

/**
 * The sources besides the top file that declare a module the top file declares too — a
 * testbench copied to a new file that kept its module name, say — and those modules.
 * Icarus refuses a module declared twice, so these files are left out of the run and the
 * top file's own module is the one that runs.
 */
function sameNamedElsewhere(files: readonly VhdlFileInput[], checked: Extract<Checked, { ok: true }>): SameNameDeclarations {
  const topModules = moduleNames(files.find((file) => file.name === checked.topFile)?.content ?? '');
  const topModulesIn = (file: VhdlFileInput) => moduleNames(file.content).filter((name) => topModules.includes(name));
  const others = files.filter(
    (file) => file.name !== checked.topFile && checked.sources.includes(file.name) && topModulesIn(file).length > 0,
  );
  return {
    unitKind: 'module',
    names: [...new Set(others.flatMap(topModulesIn))],
    topFile: checked.topFile,
    otherFiles: others.map((file) => file.name),
  };
}

/** The sources that are compiled – those left out for a same-named module are not – and every header. */
function compiledFiles(files: readonly VhdlFileInput[], allSources: readonly string[], compiled: readonly string[]): VhdlFileInput[] {
  return files.filter((file) => compiled.includes(file.name) || !allSources.includes(file.name));
}

function writeProject(dir: string, files: readonly VhdlFileInput[]): void {
  writeFileSync(join(dir, TIMESCALE_FILE_NAME), TIMESCALE_SOURCE);
  for (const file of files) writeFileSync(join(dir, file.name), file.content);
}

/** Generated files compiled before the student's, and further root modules. */
interface Extras {
  readonly files?: readonly string[];
  readonly roots?: readonly string[];
}

const compileRequest = (build: Build, target: string, extras: Extras = {}): CompileRequest => ({
  dir: build.dir,
  target,
  files: [...(extras.files ?? []), ...build.sources],
  extraRoots: extras.roots ?? [],
});

function batchPlan(build: Build, messages: readonly string[], wave: PlannedWave | undefined): RunPlan {
  const plan: RunPlan = { mode: 'batch', dir: build.dir, runTarget: build.top, timing: TIMING_WITHOUT_CLOCK_50, pacing: PACING, messages };
  return wave === undefined ? plan : { ...plan, wave };
}

const OWN_DUMP_NOTE =
  'Your testbench sets up its own waveform ($dumpfile/$dumpvars), so the waveform shown is the file it writes.';

/** How a waveform is recorded for a batch run, and whether it needs the helper module (§ 7.3). */
interface Recording {
  readonly wave: PlannedWave;
  readonly helper: boolean;
  readonly note?: string;
}

function planWave(files: readonly VhdlFileInput[]): Recording {
  const own = findOwnDump(files.map((file) => file.content));
  if (!own.present) return { wave: { format: 'vcd' }, helper: true };
  if (own.file === undefined) return { wave: { format: 'vcd', unusableOwnDump: true }, helper: false, note: OWN_DUMP_MISSING_MESSAGE };
  return { wave: { format: 'vcd', ownFile: own.file }, helper: false, note: OWN_DUMP_NOTE };
}

function boardPlan(build: Build, ports: readonly Port[], messages: readonly string[]): RunPlan {
  const timing = boardTimingFor(boardPortSpellings(ports, build.board).has(build.board.clock50.toLowerCase()));
  return { mode: 'board', dir: build.dir, runTarget: SIMULATION_FILE_NAME, timing, pacing: PACING, messages };
}

/**
 * A standalone testbench supplies its own stimuli: compile the student's top directly and
 * run it. With a waveform asked for, HDLBoard's helper module is compiled beside it as a
 * second root – unless the student's code dumps a waveform itself.
 */
async function prepareBatch(build: Build, ports: readonly Port[], recording: Recording | undefined): Promise<PrepareResult> {
  const compiled = await compileVerilog(build.tools, compileRequest(build, build.top, helperExtras(build, recording)));
  if (!compiled.ok) return failure(compiled.failure.stage, compiled.failure.text);
  // A top with ports of its own but none of the board's is told why it is not a board design.
  const hint = ports.length > 0 ? [standaloneHint(build.top, build.board)] : [];
  const note = recording?.note === undefined ? [] : [recording.note];
  return { ok: true, plan: batchPlan(build, [...build.notes, ...hint, ...compiled.messages, ...note], recording?.wave) };
}

/** Writes the helper module when the recording needs it, and names it for the compile. */
function helperExtras(build: Build, recording: Recording | undefined): Extras {
  if (!recording?.helper) return {};
  writeFileSync(join(build.dir, WAVE_MODULE_FILE_NAME), waveModuleSource(build.top));
  return { files: [WAVE_MODULE_FILE_NAME], roots: [WAVE_MODULE_NAME] };
}

/**
 * A design with board ports: wrap it in the generated testbench and compile that. The
 * top alone already compiled (its ports were just read), so a failure here is the
 * wrapper's — the student's code is not the likely cause.
 */
async function prepareBoard(build: Build, ports: readonly Port[]): Promise<PrepareResult> {
  writeFileSync(join(build.dir, TESTBENCH_FILE_NAME), buildBoardTestbench(build.top, boardPortSpellings(ports, build.board), build.board));
  const compiled = await compileVerilog(build.tools, compileRequest(build, TESTBENCH_MODULE_NAME, { files: [TESTBENCH_FILE_NAME] }));
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

async function prepare({ dir, files, topFile, runTarget, wave, board }: PrepareRequest): Promise<PrepareResult> {
  const checked = checkProject(files, topFile, runTarget);
  if (!checked.ok) return failure(checked.stage, checked.text);
  writeProject(dir, files);

  const tools = getToolPaths();
  const sameNamed = sameNamedElsewhere(files, checked);
  const sources = checked.sources.filter((name) => !sameNamed.otherFiles.includes(name));
  const notes = [...(await versionNotes(tools, dir)), ...sameNameNotes(sameNamed)];
  const build: Build = { tools, dir, top: checked.top, sources, notes, board };
  const ports = await readTopPorts(tools, compileRequest(build, build.top));
  if (!ports.ok) return failure(ports.failure.stage, ports.failure.text);
  if (isBoardDesign(ports.ports, board)) return prepareBoard(build, ports.ports);
  return prepareBatch(build, ports.ports, wave === undefined ? undefined : planWave(compiledFiles(files, checked.sources, sources)));
}

/** The helper module reads its file name from a plusarg; a student's own dump names its file itself. */
function usesHelper(wave: PlannedWave | undefined): boolean {
  return wave !== undefined && wave.ownFile === undefined && !wave.unusableOwnDump;
}

export const verilogEngine: SimEngine = {
  language: 'verilog',
  prepare,
  startBoardRun: (plan, files) => startVerilogBoardRun(getToolPaths(), { dir: plan.dir, files, timing: plan.timing }),
  startBatchRun: (plan, { onOutput, timeoutMs, waveFile }) => {
    const plusargs = usesHelper(plan.wave) && waveFile !== undefined ? [wavePlusarg(waveFile)] : [];
    return startVerilogBatchRun(getToolPaths(), { dir: plan.dir, timeoutMs, plusargs }, onOutput);
  },
};
