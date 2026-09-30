// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Which `iverilog` and `vvp` to run, and whether to point them at a bundled tree
 * (docs/Verilog_implementation_plan.md § 5.8, M21). Pure: the environment and the
 * platform are parameters, so the rules are testable on any machine.
 *
 * Order of precedence: a bundled directory (`IVERILOG_DIR` — the flat tree that
 * `fetch-iverilog.ps1` assembles, run with `-B`/`-M`), then explicit executables
 * (`IVERILOG_EXE`, `VVP_EXE`), then whatever is on `PATH`.
 */

import { posix, win32 } from 'node:path';

export interface ToolPaths {
  readonly iverilog: string;
  readonly vvp: string;
  /** Set only for a bundled tree: the directory to hand the tools as `-B` and `-M`. */
  readonly bundledDir?: string;
}

/** Settings that take precedence over the environment (the packaged app passes these). */
export interface ToolPathsOptions {
  readonly iverilogDir?: string;
  readonly iverilogExe?: string;
  readonly vvpExe?: string;
}

const PROGRAM_ON_PATH = { iverilog: 'iverilog', vvp: 'vvp' } as const;

/** A setting that is unset or empty counts as absent. */
const setting = (value: string | undefined): string | undefined => (value ? value : undefined);

function pathModuleFor(platform: NodeJS.Platform): typeof posix {
  return platform === 'win32' ? win32 : posix;
}

function executableName(program: string, platform: NodeJS.Platform): string {
  return platform === 'win32' ? `${program}.exe` : program;
}

function bundled(dir: string, platform: NodeJS.Platform): ToolPaths {
  const path = pathModuleFor(platform);
  return {
    iverilog: path.join(dir, executableName(PROGRAM_ON_PATH.iverilog, platform)),
    vvp: path.join(dir, executableName(PROGRAM_ON_PATH.vvp, platform)),
    bundledDir: dir,
  };
}

/** `vvp` beside an explicit iverilog, or from PATH when iverilog is only a program name. */
function defaultVvpFor(iverilog: string, platform: NodeJS.Platform): string {
  const path = pathModuleFor(platform);
  if (!path.isAbsolute(iverilog)) return PROGRAM_ON_PATH.vvp;
  return path.join(path.dirname(iverilog), executableName(PROGRAM_ON_PATH.vvp, platform));
}

/** Explicit executables, or program names to be found on PATH. */
function explicitTools(env: NodeJS.ProcessEnv, options: ToolPathsOptions, platform: NodeJS.Platform): ToolPaths {
  const iverilog = setting(options.iverilogExe) ?? setting(env.IVERILOG_EXE) ?? PROGRAM_ON_PATH.iverilog;
  const vvp = setting(options.vvpExe) ?? setting(env.VVP_EXE) ?? defaultVvpFor(iverilog, platform);
  return { iverilog, vvp };
}

export function resolveToolPaths(
  env: NodeJS.ProcessEnv,
  options: ToolPathsOptions = {},
  platform: NodeJS.Platform = process.platform,
): ToolPaths {
  const dir = setting(options.iverilogDir) ?? setting(env.IVERILOG_DIR);
  return dir === undefined ? explicitTools(env, options, platform) : bundled(dir, platform);
}

/**
 * The same bundled tree, named by a path `iverilog` can use: on Windows, `shorten`
 * (the 8.3 short form, `shortPath.ts`) replaces a directory containing a space, because
 * `iverilog` passes `-B` unquoted to `cmd.exe`. Anything else comes back unchanged.
 */
export function withUsableBundledDir(
  paths: ToolPaths,
  shorten: (dir: string) => string,
  platform: NodeJS.Platform = process.platform,
): ToolPaths {
  if (platform !== 'win32' || paths.bundledDir === undefined || !/\s/.test(paths.bundledDir)) return paths;
  const short = shorten(paths.bundledDir);
  return short === paths.bundledDir ? paths : bundled(short, platform);
}

/**
 * `-B<dir>` for `iverilog`: where its compiler, preprocessor, modules and targets live.
 * The directory must be a native Windows path with backslashes — with `C:/…` iverilog
 * starts its compiler through `cmd.exe`, which cannot parse it (M21).
 */
export function compilerFlags(paths: ToolPaths): string[] {
  return paths.bundledDir === undefined ? [] : [`-B${paths.bundledDir}`];
}

/** `-M<dir>` for `vvp`: where it finds the `.vpi` modules a compiled design names. */
export function runtimeFlags(paths: ToolPaths): string[] {
  return paths.bundledDir === undefined ? [] : [`-M${paths.bundledDir}`];
}
