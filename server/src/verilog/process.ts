// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The compile side of the Verilog engine: asking Icarus for a design's ports and
 * building the simulation (docs/Verilog_implementation_plan.md § 5.4, steps 1 and 2).
 * The thin process layer around the pure modules — it spawns `iverilog` and reads
 * what comes back, and does no parsing of its own.
 *
 * Every file name is relative and `cwd` is the session directory: an absolute name
 * with a non-ASCII letter in it makes Icarus fail silently on Windows (M11).
 * `spawn` with an argument array only, via `runCommand` — never a shell string.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_COMMAND_TIMEOUT_MS, runCommand, type CmdResult } from '../runtime.js';
import { classifyCompileFailure, extractBanner, type CompileFailure } from './diagnostics.js';
import { SIMULATION_FILE_NAME, STUB_FILE_NAME, TIMESCALE_FILE_NAME } from './fileNames.js';
import { parseStubPorts, type Port } from './ports.js';
import { compilerFlags, type ToolPaths } from './toolPaths.js';

/** A compile is expected to finish in a fraction of a second; this only bounds a hang. */
const BUILD_TIMEOUT_MS = DEFAULT_COMMAND_TIMEOUT_MS;
const MS_PER_SECOND = 1000;

export interface CompileRequest {
  /** The session directory: `cwd` for the tool, and where every file named below lives. */
  readonly dir: string;
  /** The module to elaborate: the student's top for a stub or a batch run, the wrapper for a board run. */
  readonly target: string;
  /** Compile units in order, without the timescale file, which is always passed first. */
  readonly files: readonly string[];
}

export type PortsOutcome =
  | { readonly ok: true; readonly ports: readonly Port[] }
  | { readonly ok: false; readonly failure: CompileFailure };

export type CompileOutcome =
  | { readonly ok: true; /** The compiler's own warnings, one per line, to show the student. */ readonly messages: readonly string[] }
  | { readonly ok: false; readonly failure: CompileFailure };

const sourcesOf = (request: CompileRequest): string[] => [TIMESCALE_FILE_NAME, ...request.files];

/** Step 1: elaborate the top and dump it, so its ports can be read from Icarus's own view of it. */
export function stubArguments(tools: ToolPaths, request: CompileRequest): string[] {
  return [
    ...compilerFlags(tools),
    '-Wno-timescale',
    '-I.',
    '-s',
    request.target,
    '-tstub',
    '-o',
    STUB_FILE_NAME,
    ...sourcesOf(request),
  ];
}

/** Step 2: build the simulation. `-Wall` shows the compiler's warnings, minus the one that fires on every ordinary design (M19). */
export function compileArguments(tools: ToolPaths, request: CompileRequest): string[] {
  return [
    ...compilerFlags(tools),
    '-Wall',
    '-Wno-timescale',
    '-I.',
    '-s',
    request.target,
    '-o',
    SIMULATION_FILE_NAME,
    ...sourcesOf(request),
  ];
}

function runIverilog(tools: ToolPaths, args: string[], dir: string): Promise<CmdResult> {
  return runCommand({ cmd: tools.iverilog, args, cwd: dir, timeoutMs: BUILD_TIMEOUT_MS });
}

function failedToFinish(result: CmdResult): boolean {
  return result.timedOut || result.code !== 0;
}

function failureOf(result: CmdResult): CompileFailure {
  if (result.timedOut) {
    return { stage: 'analyze', text: `iverilog did not finish within ${BUILD_TIMEOUT_MS / MS_PER_SECOND} s and was stopped.` };
  }
  return classifyCompileFailure(result.err, result.code);
}

function nonEmptyLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '');
}

/** The first line of `iverilog -V`, or an empty string if it could not be run. */
export async function readBanner(tools: ToolPaths, dir: string): Promise<string> {
  const result = await runIverilog(tools, [...compilerFlags(tools), '-V'], dir);
  return failedToFinish(result) ? '' : extractBanner(result.out);
}

/**
 * The ports the top module has after Icarus has elaborated it. A design that does not
 * compile fails here, with Icarus's own diagnostics: the student sees the problem once,
 * from their own top, before any wrapper exists.
 */
export async function readTopPorts(tools: ToolPaths, request: CompileRequest): Promise<PortsOutcome> {
  const result = await runIverilog(tools, stubArguments(tools, request), request.dir);
  if (failedToFinish(result)) return { ok: false, failure: failureOf(result) };
  const stub = await readFile(join(request.dir, STUB_FILE_NAME), 'utf8');
  const parsed = parseStubPorts(stub, request.target);
  if (parsed.ok) return { ok: true, ports: parsed.ports };
  return { ok: false, failure: { stage: 'internal', text: `HDLBoard could not read the port list Icarus produced: ${parsed.reason}` } };
}

/** Builds `sim.vvp`. On success the compiler's warnings come back as `messages` rather than being lost. */
export async function compileVerilog(tools: ToolPaths, request: CompileRequest): Promise<CompileOutcome> {
  const result = await runIverilog(tools, compileArguments(tools, request), request.dir);
  if (failedToFinish(result)) return { ok: false, failure: failureOf(result) };
  return { ok: true, messages: nonEmptyLines(result.err) };
}
