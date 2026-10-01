// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The names a project file may not take, whichever way it gets one — New File, an
 * upload, a drop, or a rename: a name another file already has (compared ignoring
 * case, as a run would clash on any file system that ignores it), and a name starting
 * with `tb_`, which is reserved for internal use. Pure.
 */

import { ACCEPTED_FILES_TEXT, folderForUpload } from './fileKinds';

/** The start of a file name that is reserved for internal use. */
export const RESERVED_PREFIX = 'tb_';

/** A file the project refused, and why: one line of the refusal dialog. */
export interface RefusedFile {
  readonly name: string;
  readonly reason: string;
}

export const RESERVED_PREFIX_REASON = `File names that start with ${RESERVED_PREFIX} are reserved for internal use.`;

export function existsReason(name: string): string {
  return `A file named ${name} already exists in the project.`;
}

function isReserved(name: string): boolean {
  return name.toLowerCase().startsWith(RESERVED_PREFIX);
}

function isTaken(name: string, existingNames: readonly string[]): boolean {
  const wanted = name.toLowerCase();
  return existingNames.some((existing) => existing.toLowerCase() === wanted);
}

/** Why a file may not be called `name`, or `undefined` if it may. */
export function fileNameRefusal(name: string, existingNames: readonly string[]): string | undefined {
  if (isReserved(name)) return RESERVED_PREFIX_REASON;
  if (isTaken(name, existingNames)) return existsReason(name);
  return undefined;
}

export const NOT_SOURCE_REASON = `Only ${ACCEPTED_FILES_TEXT} files can be added.`;

/**
 * Why each uploaded or dropped file may not be added, in order; `undefined` for one
 * that may. A name is taken by the project's files, and by an earlier file of the
 * same drop, so dropping two `counter.vhd` adds the first only.
 */
export function incomingFileRefusals(names: readonly string[], existingNames: readonly string[]): Array<string | undefined> {
  const taken = [...existingNames];
  return names.map((name) => {
    const reason = folderForUpload(name) === undefined ? NOT_SOURCE_REASON : fileNameRefusal(name, taken);
    if (reason === undefined) taken.push(name);
    return reason;
  });
}
