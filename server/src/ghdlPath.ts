// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Which `ghdl` to run. Pure, like `verilog/toolPaths.ts`, and with the same order of
 * precedence so the two simulators are configured alike: an installation directory
 * (`GHDL_DIR` — the tree `fetch-ghdl.ps1` assembles, with the program in `bin/`), then an
 * explicit executable (`GHDL_EXE`), then whatever is on `PATH`.
 */

import { posix, win32 } from 'node:path';

/** Settings that take precedence over the environment (the packaged app passes these). */
export interface GhdlPathOptions {
  readonly ghdlDir?: string;
  readonly ghdlExe?: string;
}

const PROGRAM_ON_PATH = 'ghdl';

/** A setting that is unset or empty counts as absent. */
const setting = (value: string | undefined): string | undefined => (value ? value : undefined);

export function ghdlInDir(dir: string, platform: NodeJS.Platform = process.platform): string {
  const path = platform === 'win32' ? win32 : posix;
  return path.join(dir, 'bin', platform === 'win32' ? `${PROGRAM_ON_PATH}.exe` : PROGRAM_ON_PATH);
}

export function resolveGhdlExe(
  env: NodeJS.ProcessEnv,
  options: GhdlPathOptions = {},
  platform: NodeJS.Platform = process.platform,
): string {
  const dir = setting(options.ghdlDir) ?? setting(env.GHDL_DIR);
  if (dir !== undefined) return ghdlInDir(dir, platform);
  return setting(options.ghdlExe) ?? setting(env.GHDL_EXE) ?? PROGRAM_ON_PATH;
}
