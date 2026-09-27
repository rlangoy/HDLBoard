// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Which folder a file belongs in, and which folder a run sends
 * (docs/Verilog_implementation_plan.md § 5.1, § 6). The one place that knows the
 * extension rules: the workbench and the file tree ask, and never look at a file name
 * themselves. Pure — no React, no state.
 *
 * `vhdl/` and `verilog/` hold designs, one per language, and a run sends the files of
 * one of them, chosen by the folder of the file marked as top. `work/` holds VHDL
 * testbenches that are kept out of every run.
 */

import type { VhdlFile } from './files';

export type Folder = VhdlFile['folder'];
type Language = 'vhdl' | 'verilog';

/** The `accept` of the upload picker; a drop is not filtered by it, so `folderForUpload` decides too. */
export const UPLOAD_ACCEPT = '.vhd,.vhdl,.v,.vh';
/** What the drop hint and the rejection line call the accepted files. */
export const ACCEPTED_FILES_TEXT = '.vhd / .vhdl / .v / .vh';

// Keep in step with server/src/engines/language.ts, which applies the same extension rules
// on the backend (the two packages share no code).
const VERILOG_NAME = /\.vh?$/i;
const VHDL_NAME = /\.(vhdl?|vhd)$/i;
const VHDL_TESTBENCH_NAME = /^tb_/i;

function languageOfName(name: string): Language | undefined {
  if (VERILOG_NAME.test(name)) return 'verilog';
  if (VHDL_NAME.test(name)) return 'vhdl';
  return undefined;
}

/** The language a folder's files are written in; a testbench in `work/` is VHDL. */
function languageOfFolder(folder: Folder): Language {
  return folder === 'verilog' ? 'verilog' : 'vhdl';
}

/**
 * The folder an uploaded or dropped file lands in, or `undefined` if it is not a
 * source file. A VHDL `tb_*` goes to `work/`; a Verilog testbench stays in `verilog/`,
 * because it is compiled together with the design it tests (it is often the top).
 */
export function folderForUpload(name: string): Folder | undefined {
  const language = languageOfName(name);
  if (language === undefined) return undefined;
  if (language === 'verilog') return 'verilog';
  return VHDL_TESTBENCH_NAME.test(name) ? 'work' : 'vhdl';
}

/**
 * The folder whose files a run sends: the folder of the file marked as top when that
 * is `verilog/`, and `vhdl/` in every other case — no top marked, or a VHDL one —
 * which is what a run has always sent.
 */
export function sourceFolderFor(top: Pick<VhdlFile, 'folder'> | undefined): Extract<Folder, 'vhdl' | 'verilog'> {
  return top?.folder === 'verilog' ? 'verilog' : 'vhdl';
}

/**
 * Where a file goes when it is renamed: to the folder of its new language if the
 * extension changed the language, and nowhere otherwise — a rename within a language,
 * or to a name of no language, leaves the file where it is.
 */
export function folderAfterRename(current: Folder, newName: string): Folder {
  const language = languageOfName(newName);
  if (language === undefined || language === languageOfFolder(current)) return current;
  return folderForUpload(newName) ?? current;
}

/**
 * The file that takes over as top when `deletedId` is deleted: the first other file in
 * the deleted file's own folder (so a Verilog run stays a Verilog run), or `null`.
 */
export function topAfterDelete(files: readonly Pick<VhdlFile, 'id' | 'folder'>[], deletedId: string): string | null {
  const deleted = files.find((file) => file.id === deletedId);
  if (deleted === undefined || !hasTopDot(deleted.folder)) return null;
  return files.find((file) => file.id !== deletedId && file.folder === deleted.folder)?.id ?? null;
}

/** Whether the folder's files can be marked as the top of a run (the blue dot). */
export function hasTopDot(folder: Folder): boolean {
  return folder === 'vhdl' || folder === 'verilog';
}
