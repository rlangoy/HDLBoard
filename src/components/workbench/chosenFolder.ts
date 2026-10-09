// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * A folder the student chose in a browser (`<input webkitdirectory>`): every file in
 * it and its subfolders, each with its path from the chosen folder in
 * `webkitRelativePath`, e.g. `test_s/DE1_SoC.vhdl`. Pure: no DOM.
 */

import { isProjectFileName } from '../../project/fileName';

export interface ChosenFile {
  name: string;
  /** `folder/name` for a file in the chosen folder itself; empty when the file was not chosen as part of a folder. */
  webkitRelativePath: string;
}

/** The files in the chosen folder itself, not in its subfolders (a project is flat, § 5). */
export function filesDirectlyInFolder<T extends ChosenFile>(files: readonly T[]): T[] {
  return files.filter((file) => (file.webkitRelativePath || file.name).split('/').length <= 2);
}

/** The folder's project file: its first `.hdlboard.json` by name, or undefined when there is none (§ 6.4). */
export function projectFileInFolder<T extends ChosenFile>(files: readonly T[]): T | undefined {
  return filesDirectlyInFolder(files)
    .filter((file) => isProjectFileName(file.name))
    .sort((a, b) => a.name.localeCompare(b.name))[0];
}
