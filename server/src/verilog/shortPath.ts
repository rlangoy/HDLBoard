// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The Windows 8.3 short form of a directory, for handing to `iverilog -B`.
 *
 * `iverilog` runs its preprocessor and compiler as one `cmd.exe` pipeline built from
 * the `-B` directory without quoting it, so a tree under a path with a space — any
 * install in `C:\Program Files`, or a user profile like `C:\Users\Ola Nordmann` — fails
 * every compile with "'C:\Program' is not recognized as an internal or external
 * command". The short form (`C:\PROGRA~1\…`) has no spaces and names the same folder.
 *
 * Node has no binding for `GetShortPathNameW`, so this asks `cmd.exe`'s `%~s`
 * modifier, once, at startup. Where it cannot help — short names disabled on the
 * volume (`fsutil 8dot3name`), or `cmd` failing — the original path is returned and
 * the caller reports it.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export function hasSpace(path: string): boolean {
  return /\s/.test(path);
}

export function windowsShortPath(dir: string): string {
  // `"` cannot occur in a Windows path; `%` could be expanded by cmd, so it is left alone.
  if (!hasSpace(dir) || dir.includes('"') || dir.includes('%')) return dir;
  // Verbatim: Node's own quoting (\") means nothing to cmd.exe.
  const result = spawnSync('cmd.exe', ['/d', '/s', '/c', `"for %I in ("${dir}") do @echo %~sI"`], {
    encoding: 'utf8',
    windowsHide: true,
    windowsVerbatimArguments: true,
    timeout: 5000,
  });
  const out = result.status === 0 ? result.stdout.trim() : '';
  return out !== '' && existsSync(out) ? out : dir;
}
