// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * A session directory as the Verilog engine will leave it before compiling: the
 * timescale file first, then the student's files — and, for run tests, one that is
 * already compiled around a generated board wrapper.
 */

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { TESTBENCH_FILE_NAME, TIMESCALE_FILE_NAME } from '../verilog/fileNames.js';
import { boardPortSpellings } from '../verilog/ports.js';
import { compileVerilog, readTopPorts } from '../verilog/process.js';
import { buildBoardTestbench, TESTBENCH_MODULE_NAME } from '../verilog/testbench.js';
import type { ToolPaths } from '../verilog/toolPaths.js';
import { makeTempDir, type TempDir } from './sessionDir.js';

const TIMESCALE_SOURCE = '`timescale 1ns/1ps\n';
/** A space and a non-ASCII letter: the directory names that broke Icarus's file access (M11). */
export const AWKWARD_DIRECTORY_PREFIX = 'hdlboard smoke ø ';

type SourceFiles = Readonly<Record<string, string>>;

/** A fresh directory holding `files` (name -> content) and the timescale file. */
export function prepareSession(files: SourceFiles, prefix = 'hdlboard-vlog-'): TempDir {
  const dir = makeTempDir(prefix);
  writeFileSync(join(dir.path, TIMESCALE_FILE_NAME), TIMESCALE_SOURCE);
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir.path, name), content);
  return dir;
}

/** `prepareSession`, removed automatically when the test ends. */
export function sessionFor(t: TestContext, files: SourceFiles, prefix?: string): string {
  const dir = prepareSession(files, prefix);
  t.after(() => dir.cleanup());
  return dir.path;
}

export interface BoardSessionSpec {
  readonly tools: ToolPaths;
  /** All the student's sources, name -> content. */
  readonly files: SourceFiles;
  /** The module the generated wrapper instantiates. */
  readonly top: string;
}

/**
 * A session with the board wrapper generated and everything compiled to `sim.vvp`,
 * ready to run — the engine's own sequence: read the top's ports, generate the wrapper
 * from them, compile.
 */
export async function compiledBoardSession(t: TestContext, { tools, files, top }: BoardSessionSpec): Promise<string> {
  const dir = sessionFor(t, files);
  const names = Object.keys(files);
  const ports = await readTopPorts(tools, { dir, target: top, files: names });
  assert.ok(ports.ok, ports.ok ? '' : ports.failure.text);
  writeFileSync(join(dir, TESTBENCH_FILE_NAME), buildBoardTestbench(top, boardPortSpellings(ports.ports)));
  const compiled = await compileVerilog(tools, { dir, target: TESTBENCH_MODULE_NAME, files: [TESTBENCH_FILE_NAME, ...names] });
  assert.ok(compiled.ok, compiled.ok ? '' : compiled.failure.text);
  return dir;
}
