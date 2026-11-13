// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The environment the compilers and simulators run with. They run the student's code, and
 * that code can read files (VHDL `textio`, Verilog `$fopen`) — `/proc/self/environ` among
 * them — and print what it read to the console. So they get only what a program needs to
 * start and find its libraries, never the backend's own settings and secrets
 * (`GITHUB_CLIENT_SECRET`, a host's API keys). The tools find their own files through
 * arguments (`-B`, `-M`, the GHDL executable's path), not the environment. Pure.
 */

/**
 * What any program needs: where programs and libraries are, temp, locale, time zone. And
 * the memory cap the Docker image's docker/simlimit.sh puts on every tool it wraps: the
 * wrapper is the child, so without it every run would get the script's default instead.
 */
const POSIX_NAMES: readonly string[] = [
  'PATH',
  'LD_LIBRARY_PATH',
  'TMPDIR',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
  'GHDL_PREFIX',
  'HDLBOARD_SIM_MEMORY_MB',
];

/** The same on Windows, where a program cannot start without SystemRoot. */
const WINDOWS_NAMES: readonly string[] = [
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'SYSTEMDRIVE',
  'WINDIR',
  'COMSPEC',
  'TEMP',
  'TMP',
  'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE',
  'GHDL_PREFIX',
];

/**
 * The variables of `env` a child may see. Windows names are matched without case (`Path`
 * is `PATH` there) and keep the spelling they have.
 */
export function childEnv(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): NodeJS.ProcessEnv {
  const windows = platform === 'win32';
  const allowed = new Set(windows ? WINDOWS_NAMES : POSIX_NAMES);
  const kept: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(env)) {
    if (value !== undefined && allowed.has(windows ? name.toUpperCase() : name)) kept[name] = value;
  }
  return kept;
}
