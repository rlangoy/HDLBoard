// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { isProjectFileName } from './fileName';

/** Outcome of looking for the project file in a folder (§ 6.4). */
export type ProjectFileChoice =
  | { kind: 'none' }
  | { kind: 'one'; name: string }
  | { kind: 'several'; names: string[] };

export const NO_PROJECT_FILE_MESSAGE = 'No project file found (expected a file ending in .hdlboard.json)';

export function selectProjectFile(fileNames: readonly string[]): ProjectFileChoice {
  const candidates = fileNames.filter(isProjectFileName).sort((a, b) => a.localeCompare(b));
  if (candidates.length === 0) return { kind: 'none' };
  if (candidates.length === 1) return { kind: 'one', name: candidates[0] };
  return { kind: 'several', names: candidates };
}
