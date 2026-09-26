// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Which simulator engine a run belongs to, decided by the top file's extension alone
 * (docs/Verilog_implementation_plan.md § 5.1). No protocol field is needed: `RUN
 * <topFile>` already carries the name, and the frontend sends only the files of that
 * file's folder. Pure functions over file names.
 */

import type { Language } from './types.js';

// Keep in step with src/components/workbench/fileKinds.ts, which applies the same
// extension rules in the browser (the two packages share no code).
const VERILOG_EXTENSION = /\.vh?$/i;
const VHDL_EXTENSION = /\.vhdl?$/i;

const DISPLAY_NAME: Record<Language, string> = { vhdl: 'VHDL', verilog: 'Verilog' };

/** The language a file name belongs to, or `undefined` for a file that is neither. */
export function languageOfFile(fileName: string): Language | undefined {
  if (VERILOG_EXTENSION.test(fileName)) return 'verilog';
  if (VHDL_EXTENSION.test(fileName)) return 'vhdl';
  return undefined;
}

/**
 * The language of a run, from its top file. With no top file marked — or one of no
 * known language — the run is VHDL, exactly as it was before Verilog existed; GHDL
 * then reports whatever is wrong with the file.
 */
export function languageOfTopFile(topFile: string | undefined): Language {
  return (topFile === undefined ? undefined : languageOfFile(topFile)) ?? 'vhdl';
}

/**
 * Files in a run that clearly belong to the *other* language. A file of no known
 * language is not counted: the frontend never sends one, and what GHDL does with it is
 * unchanged.
 */
export function mismatchedFiles(files: ReadonlyArray<{ readonly name: string }>, language: Language): string[] {
  return files
    .map((file) => file.name)
    .filter((name) => {
      const own = languageOfFile(name);
      return own !== undefined && own !== language;
    });
}

export function mismatchMessage(language: Language, topFile: string, offenders: readonly string[]): string {
  return (
    `This is a ${DISPLAY_NAME[language]} run (top file ${topFile}), but it also received files from the other language: ` +
    `${offenders.join(', ')}. Mark a top file in one language and run it again.`
  );
}
