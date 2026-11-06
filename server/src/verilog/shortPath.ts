// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * A name for a directory that `iverilog -B` can use: the Windows 8.3 short form, or on
 * Linux a symbolic link in the temporary directory.
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
import { existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hasShellSpecial } from './toolPaths.js';

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

/**
 * The same problem on Linux: `iverilog` runs `<-B dir>/ivlpp` and `<-B dir>/ivl` through
 * `system()`, so `sh` splits the directory at a space. That happens when a student
 * extracts the AppImage (`--appimage-extract`) into a folder like `~/Nedlastinger/HDL Board ø/`.
 * A link without such characters, in the temporary directory, names the same folder.
 * It is removed when the process exits. Where it cannot be made, the original path is
 * returned and the caller reports it.
 */
export function posixLinkPath(dir: string, tempRoot: string = tmpdir()): string {
  if (!hasShellSpecial(dir) || hasShellSpecial(tempRoot)) return dir;
  try {
    const holder = mkdtempSync(join(tempRoot, 'hdlboard-iverilog-'));
    process.once('exit', () => rmSync(holder, { recursive: true, force: true }));
    const link = join(holder, 'iverilog');
    symlinkSync(dir, link, 'dir');
    return link;
  } catch {
    return dir;
  }
}
