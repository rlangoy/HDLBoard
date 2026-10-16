// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Plugin files sent with a run (docs/plugin_batch_implementation_plan.md § 6.4). While
 * the frontend's Plugins page is on, `RUN` carries the files of the enabled plugins under
 * the reserved prefix `hdlboard/`, and they are analysed instead of the installed ones.
 * Only names of the catalog may use the prefix, so a sent copy can never overwrite a
 * student file and a student file can never pose as a plugin. Pure.
 */

import { PLUGIN_CATALOG, SHARED_FILES, filesToAnalyse, type PluginInfo } from './pluginCatalog.js';
import type { VhdlFileInput } from './protocol.js';

export const PLUGIN_FILE_PREFIX = 'hdlboard/';
const BYTES_PER_KB = 1024;
/** Far above any plugin; bounds what one edited file can cost the server. */
const MAX_PLUGIN_FILE_KB = 256;
export const MAX_PLUGIN_FILE_BYTES = MAX_PLUGIN_FILE_KB * BYTES_PER_KB;

/** The student's files and the plugin files of one `RUN`, plugin names without the prefix. */
export interface RunFiles {
  readonly studentFiles: VhdlFileInput[];
  readonly pluginFiles: VhdlFileInput[];
}

function knownPluginFileNames(catalog: readonly PluginInfo[]): Set<string> {
  return new Set([...SHARED_FILES, ...catalog.flatMap((p) => p.files)]);
}

function pluginFileProblem(name: string, content: string, known: ReadonlySet<string>): string | undefined {
  if (!known.has(name)) return `${PLUGIN_FILE_PREFIX}${name} is not a plugin file. Files under ${PLUGIN_FILE_PREFIX} must be one of: ${[...known].join(', ')}.`;
  if (Buffer.byteLength(content, 'utf8') > MAX_PLUGIN_FILE_BYTES) return `${PLUGIN_FILE_PREFIX}${name} is larger than ${MAX_PLUGIN_FILE_KB} KB.`;
  return undefined;
}

/**
 * Splits a run's files into the student's and the plugins'. Plugin files of a plugin
 * that is not enabled are left out: a disabled plugin behaves as if it were not
 * installed. A name under the prefix that is not a catalog file is an error.
 */
export function splitRunFiles(
  files: readonly VhdlFileInput[],
  enabledIds: readonly string[],
  catalog: readonly PluginInfo[] = PLUGIN_CATALOG,
): RunFiles | { message: string } {
  const known = knownPluginFileNames(catalog);
  const used = new Set(filesToAnalyse(enabledIds, catalog));
  const studentFiles: VhdlFileInput[] = [];
  const pluginFiles: VhdlFileInput[] = [];
  for (const file of files) {
    if (!file.name.startsWith(PLUGIN_FILE_PREFIX)) {
      studentFiles.push(file);
      continue;
    }
    const name = file.name.slice(PLUGIN_FILE_PREFIX.length);
    const problem = pluginFileProblem(name, file.content, known);
    if (problem !== undefined) return { message: problem };
    if (used.has(name)) pluginFiles.push({ name, content: file.content });
  }
  return { studentFiles, pluginFiles };
}
