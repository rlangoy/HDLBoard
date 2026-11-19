// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** The one place a unit's key is built (`fileId:unitKey`), with the language's case rule. Pure. */

import { unitKey } from '../tbDetect/analyzeProject';
import type { Language, ProjectAnalysis } from '../tbDetect/types';

export const unitRefKey = (fileId: string, language: Language, unitName: string): string =>
  `${fileId}:${unitKey(language, unitName)}`;

/** The key of the unit `unitName` as the project defines it, or undefined when no file does. */
export function definedUnitKey(project: ProjectAnalysis, language: Language, unitName: string): string | undefined {
  const fileId = project.unitIndex[language].get(unitKey(language, unitName));
  return fileId === undefined ? undefined : unitRefKey(fileId, language, unitName);
}

/** The file id of a unit key. */
export const fileOfKey = (key: string): string => key.slice(0, key.lastIndexOf(':'));

/** The unit-name part of a unit key, compared as its language compares names. */
export const nameOfKey = (key: string): string => key.slice(key.lastIndexOf(':') + 1);
