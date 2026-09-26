// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Validating the names of the source files a student's project sends
 * (docs/Verilog_implementation_plan.md § 5.4, § 5.10). A name reaches the filesystem
 * (the session directory) and the compiler's command line, so it must be a plain
 * file name that cannot collide with a generated file, leave the session directory,
 * or be read as an option. The arguments themselves are never joined into a shell
 * string; these rules are the second line of defence, not the first.
 *
 * Pure: it checks text and touches nothing.
 */

/** Files the backend writes itself; a student file with one of these names would overwrite it. */
export const RESERVED_FILE_NAMES: readonly string[] = ['_hdlboard_ts.v', 'hdl_board_tb.v', 'ports.stub', 'sim.vvp'];

export type SourceKind = 'source' | 'header';

export type NameCheck =
  | { readonly ok: true; readonly kind: SourceKind }
  | { readonly ok: false; readonly reason: string };

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
/** Separators, and the colon that makes `C:x.v` a drive-relative path on Windows. */
const PATH_CHARACTER = /[\\/:]/;
const SOURCE_EXTENSION = /\.v$/i;
const HEADER_EXTENSION = /\.vh$/i;

type Rule = (name: string) => string | undefined;

const rejectEmpty: Rule = (name) => (name === '' ? 'A file name cannot be empty.' : undefined);

const rejectControlCharacters: Rule = (name) =>
  CONTROL_CHARACTER.test(name) ? 'A file name cannot contain control characters.' : undefined;

const rejectPaths: Rule = (name) =>
  name.includes('..') || PATH_CHARACTER.test(name) ? `${name} must be a plain file name, not a folder or a path.` : undefined;

const rejectLeadingDash: Rule = (name) =>
  name.startsWith('-') ? `${name}: file names cannot start with "-", which the compiler would read as an option.` : undefined;

const rejectReservedNames: Rule = (name) =>
  RESERVED_FILE_NAMES.includes(name.toLowerCase()) ? `${name} is reserved: HDLBoard generates a file with that name.` : undefined;

const rejectBareExtension: Rule = (name) =>
  /^\.[^.]*$/.test(name) ? `${name} has no name before its extension.` : undefined;

const rejectNonVerilog: Rule = (name) =>
  SOURCE_EXTENSION.test(name) || HEADER_EXTENSION.test(name)
    ? undefined
    : `${name} is not a Verilog file: a Verilog run accepts .v sources and .vh headers.`;

/** In the order the reasons are most useful: structural problems first, then meaning. */
const RULES: readonly Rule[] = [
  rejectEmpty,
  rejectControlCharacters,
  rejectPaths,
  rejectLeadingDash,
  rejectReservedNames,
  rejectBareExtension,
  rejectNonVerilog,
];

function firstProblem(name: string): string | undefined {
  for (const rule of RULES) {
    const problem = rule(name);
    if (problem !== undefined) return problem;
  }
  return undefined;
}

export function validateSourceName(name: string): NameCheck {
  const problem = firstProblem(name);
  if (problem !== undefined) return { ok: false, reason: problem };
  return { ok: true, kind: HEADER_EXTENSION.test(name) ? 'header' : 'source' };
}
