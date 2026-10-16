// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The plugin library `hdlboard` (docs/plugin_batch_implementation_plan.md § 5, § 6.4):
 * built in the session directory before the student's files are analysed, and only
 * when one of them declares `library hdlboard`. `--work=hdlboard` makes GHDL write
 * `hdlboard-obj08.cf` next to `work-obj08.cf`, where `ghdl -e`/`-r` find it without
 * further options.
 *
 * The files are the shipped ones in the plugin root, analysed in place, except where
 * the run sent an edited copy: that is written to `hdlboard/` in the session directory
 * (never to the plugin root, so one user's edit cannot reach another session) and
 * analysed in the same position instead.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { filesToAnalyse } from '../pluginCatalog.js';
import type { ErrorStage, VhdlFileInput } from '../protocol.js';
import type { CmdResult } from '../runtime.js';
import type { PluginRequest } from './types.js';

export const PLUGIN_LIBRARY = 'hdlboard';
/** Edited copies, relative to the session directory; GHDL's messages name them by this path. */
const EDITED_DIR = 'hdlboard';
const LIBRARY_FILE = /^hdlboard-obj\d*\.cf$/;
const GHDL_STANDARD = '--std=08';
const ANALYSE_INTO_LIBRARY = ['-a', GHDL_STANDARD, `--work=${PLUGIN_LIBRARY}`];

/** Runs `ghdl` with `args` in the session directory. */
export type GhdlRunner = (args: string[]) => Promise<CmdResult>;

/** One file of the library and where its text comes from. */
export interface LibrarySource {
  readonly name: string;
  /** For GHDL, run in the session directory: relative for an edited copy, absolute for an installed file. */
  readonly path: string;
  readonly edited: boolean;
}

export type LibraryResult =
  | { readonly ok: true; readonly notices: readonly string[] }
  | { readonly ok: false; readonly stage: ErrorStage; readonly text: string };

/** Removes the last run's library and edited copies, so every run builds it afresh. */
export function clearPluginLibrary(dir: string): void {
  for (const name of readdirSync(dir)) {
    if (LIBRARY_FILE.test(name)) rmSync(join(dir, name), { force: true });
  }
  rmSync(join(dir, EDITED_DIR), { recursive: true, force: true });
}

/** The library's files in analysis order, each from its edited copy if the run sent one. Pure. */
export function librarySources(request: PluginRequest, pluginRoot: string): LibrarySource[] {
  const edited = new Set(request.editedFiles.map((file) => file.name));
  return filesToAnalyse(request.enabledIds).map((name) =>
    edited.has(name) ? { name, path: `${EDITED_DIR}/${name}`, edited: true } : { name, path: join(pluginRoot, name), edited: false },
  );
}

const sameText = (a: string, b: string) => a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');

function readInstalled(pluginRoot: string, name: string): string | undefined {
  try {
    return readFileSync(join(pluginRoot, name), 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * The console line naming the sent files that differ from the installed ones, so an
 * edit that is easy to forget shows in every run. Nothing when every copy is unchanged.
 */
export function editedFilesNotice(editedFiles: readonly VhdlFileInput[], pluginRoot: string): string | undefined {
  const changed = editedFiles.filter((file) => {
    const installed = readInstalled(pluginRoot, file.name);
    return installed === undefined || !sameText(installed, file.content);
  });
  return changed.length > 0 ? `Plugins: using edited files: ${changed.map((file) => file.name).join(', ')}` : undefined;
}

function writeEditedFiles(dir: string, editedFiles: readonly VhdlFileInput[]): void {
  if (editedFiles.length === 0) return;
  mkdirSync(join(dir, EDITED_DIR), { recursive: true });
  for (const file of editedFiles) writeFileSync(join(dir, EDITED_DIR, file.name), file.content);
}

const internal = (text: string): LibraryResult => ({ ok: false, stage: 'internal', text });

function analysisFailure(source: LibrarySource, pluginRoot: string, result: CmdResult): LibraryResult {
  const output = result.err || result.out || '(no output)';
  if (source.edited) {
    return { ok: false, stage: 'plugin', text: `Plugin file ${source.path} (edited on the Plugins page) could not be analysed:\n${output}` };
  }
  return internal(`Plugin library: could not analyse ${source.name} (ghdl ${ANALYSE_INTO_LIBRARY.join(' ')}, plugin root ${pluginRoot}):\n${output}`);
}

export interface LibraryBuild {
  /** The session directory, which GHDL runs in. */
  readonly dir: string;
  readonly request: PluginRequest;
  readonly pluginRoot: string;
  readonly ghdl: GhdlRunner;
}

/**
 * Analyses the library's files one by one, so a failure names the file it came from: an
 * edited copy is the user's (`plugin`), a shipped file an installation fault (`internal`).
 */
export async function buildPluginLibrary({ dir, request, pluginRoot, ghdl }: LibraryBuild): Promise<LibraryResult> {
  const sources = librarySources(request, pluginRoot);
  if (sources.some((source) => !source.edited) && !existsSync(pluginRoot)) {
    return internal(`Plugin library: plugin root not found: ${pluginRoot}`);
  }
  const missing = sources.find((source) => !source.edited && !existsSync(source.path));
  if (missing !== undefined) return internal(`Plugin library: ${missing.name} not found in plugin root ${pluginRoot}`);

  writeEditedFiles(dir, request.editedFiles);
  for (const source of sources) {
    const result = await ghdl([...ANALYSE_INTO_LIBRARY, source.path]);
    if (result.code !== 0) return analysisFailure(source, pluginRoot, result);
  }
  const notice = editedFilesNotice(request.editedFiles, pluginRoot);
  return { ok: true, notices: notice === undefined ? [] : [notice] };
}
