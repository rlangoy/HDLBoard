// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Which Icarus the running backend uses — set once at startup, read by the Verilog
 * engine, the same shape as `setGhdlExe`/`getGhdlExe` for GHDL. `startBackend()` calls
 * `setToolPaths()` before anything can spawn: the packaged Windows app passes its
 * bundled tree, every other deployment leaves it to `IVERILOG_DIR`, `IVERILOG_EXE`,
 * `VVP_EXE` or `PATH` (docs/Verilog_implementation_plan.md § 5.8, § 5.9).
 */

import { resolveToolPaths, type ToolPaths } from './toolPaths.js';

let configured: ToolPaths = resolveToolPaths(process.env);

export function setToolPaths(paths: ToolPaths): void {
  configured = paths;
}

export function getToolPaths(): ToolPaths {
  return configured;
}
