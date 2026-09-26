// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Finds a simulator for a test, or says why it could not — so a test that needs
 * GHDL or Icarus skips itself with a reason instead of failing on a machine that
 * simply does not have it (docs/Verilog_implementation_plan.md § 7.2).
 *
 * Lookup order matches how the backend itself will find the tool: an explicit
 * environment setting first (`IVERILOG_DIR` is the bundled tree from step B2), then
 * the vendored tree in this repository if it has been fetched, then `PATH`.
 */

import { statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { repoRoot } from './fixture.js';

export type ToolName = 'ghdl' | 'iverilog';

export interface ToolLookup {
  /** Absolute path to the executable, or null when it was not found. */
  readonly exe: string | null;
  /** For `node:test`'s `skip` option: the reason when missing, `false` when found. */
  readonly skip: string | false;
}

const WINDOWS = process.platform === 'win32';
const DEFAULT_WINDOWS_EXTENSIONS = '.EXE;.CMD;.BAT';

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function executableSuffixes(env: NodeJS.ProcessEnv): string[] {
  if (!WINDOWS) return [''];
  return (env.PATHEXT ?? DEFAULT_WINDOWS_EXTENSIONS).split(';').filter(Boolean);
}

/** The first executable called `name` on `env.PATH`, or null. */
export function findOnPath(name: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const directories = (env.PATH ?? '').split(delimiter).filter(Boolean);
  for (const directory of directories) {
    for (const suffix of executableSuffixes(env)) {
      const candidate = join(directory, name + suffix);
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
}

/** Where `fetch-iverilog.ps1` puts the bundled tree, relative to the repository root. */
const VENDORED_ICARUS_DIR = join('winInstaller', 'vendor', 'iverilog');

function firstExistingFile(candidates: ReadonlyArray<string | undefined>): string | null {
  return candidates.find((path): path is string => path !== undefined && isFile(path)) ?? null;
}

function fromEnvironment(name: ToolName, env: NodeJS.ProcessEnv): string | null {
  if (name === 'ghdl') return firstExistingFile([env.GHDL_EXE]);
  const bundled = env.IVERILOG_DIR ? join(env.IVERILOG_DIR, WINDOWS ? 'iverilog.exe' : 'iverilog') : undefined;
  return firstExistingFile([bundled, env.IVERILOG_EXE]);
}

/** Only Icarus is vendored; a machine that ran the fetch script needs no environment setting. */
function fromVendoredTree(name: ToolName, root: string): string | null {
  if (name !== 'iverilog') return null;
  return firstExistingFile([join(root, VENDORED_ICARUS_DIR, WINDOWS ? 'iverilog.exe' : 'iverilog')]);
}

const ENVIRONMENT_HINT: Record<ToolName, string> = {
  ghdl: 'GHDL_EXE',
  iverilog: 'IVERILOG_DIR or IVERILOG_EXE',
};

export function requireTool(name: ToolName, env: NodeJS.ProcessEnv = process.env, vendoredRoot: string = repoRoot()): ToolLookup {
  const exe = fromEnvironment(name, env) ?? fromVendoredTree(name, vendoredRoot) ?? findOnPath(name, env);
  if (exe) return { exe, skip: false };
  return { exe: null, skip: `${name} not found: put it on PATH or set ${ENVIRONMENT_HINT[name]}` };
}
