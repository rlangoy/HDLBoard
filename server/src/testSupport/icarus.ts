// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The Icarus Verilog a test should use, in the form the backend's own code takes it
 * (`ToolPaths`): a bundled tree is run with `-B`/`-M`, a system install is not.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { BackendOptions } from '../server.js';
import { resolveToolPaths, type ToolPaths } from '../verilog/toolPaths.js';
import { requireTool } from './requireTool.js';

export interface IcarusForTests {
  /** Always usable in a type sense; only meaningful when `skip` is `false`. */
  readonly tools: ToolPaths;
  /** For `node:test`'s `skip` option. */
  readonly skip: string | false;
}

/** Present in the flat tree `fetch-iverilog.ps1` builds, absent from a system install's bin directory. */
const BUNDLED_TREE_MARKER = 'vvp.conf';

function toolPathsFor(iverilogExe: string): ToolPaths {
  const dir = dirname(iverilogExe);
  return existsSync(join(dir, BUNDLED_TREE_MARKER))
    ? resolveToolPaths({ IVERILOG_DIR: dir })
    : resolveToolPaths({ IVERILOG_EXE: iverilogExe });
}

export function icarusForTests(): IcarusForTests {
  const lookup = requireTool('iverilog');
  if (lookup.exe === null) return { tools: resolveToolPaths({}), skip: lookup.skip };
  return { tools: toolPathsFor(lookup.exe), skip: false };
}

/** The `startBackend` options that make a test backend use the same Icarus as `tools`. */
export function backendOptionsFor(tools: ToolPaths): Pick<BackendOptions, 'iverilogDir' | 'iverilogExe' | 'vvpExe'> {
  if (tools.bundledDir !== undefined) return { iverilogDir: tools.bundledDir };
  return { iverilogExe: tools.iverilog, vvpExe: tools.vvp };
}
