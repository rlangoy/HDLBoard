// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** Lookups for the board tests that fail loudly instead of asserting a value is there. */

import { languageOfName, type Language } from '../components/workbench/fileKinds';

/** The HDL language of a built-in file; a name of no language is a bug in the test data. */
export function languageOf(fileName: string): Language {
  const language = languageOfName(fileName);
  if (language === undefined) throw new Error(`${fileName} is not an HDL file`);
  return language;
}

/** The one item of `items` that `matches`; none is a bug in the test data. */
export function theOne<T>(items: readonly T[], matches: (item: T) => boolean, what: string): T {
  const found = items.find(matches);
  if (found === undefined) throw new Error(`No ${what}`);
  return found;
}
