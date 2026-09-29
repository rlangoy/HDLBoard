// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The rules every submitted file name must pass, whatever its language. A name
 * reaches the filesystem (the session directory) and a compiler's command line, so
 * it must be a plain file name that cannot leave the session directory or be read as
 * an option. `Session` applies them to every run before an engine sees the files;
 * `verilog/fileNames.ts` adds the Verilog engine's own rules after these. Pure.
 */

/** A reason the name is unusable, or `undefined` if the rule has nothing against it. */
export type NameRule = (name: string) => string | undefined;

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
/** Separators, and the colon that makes `C:x.v` a drive-relative path on Windows. */
const PATH_CHARACTER = /[\\/:]/;

export const rejectEmpty: NameRule = (name) => (name === '' ? 'A file name cannot be empty.' : undefined);

export const rejectControlCharacters: NameRule = (name) =>
  CONTROL_CHARACTER.test(name) ? 'A file name cannot contain control characters.' : undefined;

export const rejectPaths: NameRule = (name) =>
  name.includes('..') || PATH_CHARACTER.test(name) ? `${name} must be a plain file name, not a folder or a path.` : undefined;

export const rejectLeadingDash: NameRule = (name) =>
  name.startsWith('-') ? `${name}: file names cannot start with "-", which the compiler would read as an option.` : undefined;

/** Structural problems only, in the order their reasons are most useful. */
export const PLAIN_NAME_RULES: readonly NameRule[] = [rejectEmpty, rejectControlCharacters, rejectPaths, rejectLeadingDash];

/** The first reason `rules` give against `name`, or `undefined` when none objects. */
export function firstProblem(name: string, rules: readonly NameRule[]): string | undefined {
  for (const rule of rules) {
    const problem = rule(name);
    if (problem !== undefined) return problem;
  }
  return undefined;
}

/** The first file whose name is not a plain file name, as the reason why; `undefined` when all are. */
export function firstUnsafeName(files: ReadonlyArray<{ readonly name: string }>): string | undefined {
  for (const { name } of files) {
    const problem = firstProblem(name, PLAIN_NAME_RULES);
    if (problem !== undefined) return problem;
  }
  return undefined;
}
