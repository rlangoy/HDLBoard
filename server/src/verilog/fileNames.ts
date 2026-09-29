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

import { firstProblem, PLAIN_NAME_RULES, type NameRule } from '../engines/sourceNames.js';

/** The files the backend writes into a session directory, named once so nothing can drift. */
export const TIMESCALE_FILE_NAME = '_hdlboard_ts.v';
/** Passed first to every compile, so `#delay`s mean nanoseconds however the student's files begin. */
export const TIMESCALE_SOURCE = '`timescale 1ns/1ps\n';
export const TESTBENCH_FILE_NAME = 'hdl_board_tb.v';
export const STUB_FILE_NAME = 'ports.stub';
export const SIMULATION_FILE_NAME = 'sim.vvp';

/** A student file with one of these names would overwrite a generated one. */
export const RESERVED_FILE_NAMES: readonly string[] = [
  TIMESCALE_FILE_NAME,
  TESTBENCH_FILE_NAME,
  STUB_FILE_NAME,
  SIMULATION_FILE_NAME,
];

export type SourceKind = 'source' | 'header';

export type NameCheck =
  | { readonly ok: true; readonly kind: SourceKind }
  | { readonly ok: false; readonly reason: string };

const SOURCE_EXTENSION = /\.v$/i;
const HEADER_EXTENSION = /\.vh$/i;

const rejectReservedNames: NameRule = (name) =>
  RESERVED_FILE_NAMES.includes(name.toLowerCase()) ? `${name} is reserved: HDLBoard generates a file with that name.` : undefined;

const rejectBareExtension: NameRule = (name) =>
  /^\.[^.]*$/.test(name) ? `${name} has no name before its extension.` : undefined;

const rejectNonVerilog: NameRule = (name) =>
  SOURCE_EXTENSION.test(name) || HEADER_EXTENSION.test(name)
    ? undefined
    : `${name} is not a Verilog file: a Verilog run accepts .v sources and .vh headers.`;

/** In the order the reasons are most useful: structural problems first, then meaning. */
const RULES: readonly NameRule[] = [...PLAIN_NAME_RULES, rejectReservedNames, rejectBareExtension, rejectNonVerilog];

export function validateSourceName(name: string): NameCheck {
  const problem = firstProblem(name, RULES);
  if (problem !== undefined) return { ok: false, reason: problem };
  return { ok: true, kind: HEADER_EXTENSION.test(name) ? 'header' : 'source' };
}
