// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The start-up defaults a teacher or host can set in `settings.json`, served next to
 * `index.html` like `boards/boards.json`. A setting the student has changed in Settings
 * wins over the file; the file wins over the built-in default. A missing file is normal;
 * a broken one is logged and the built-in defaults are used.
 *
 *   { "bouncyButtons": false }
 */

import { fetchBoardFile, type FetchedText } from '../../boards/boardCatalog';
import { errorText } from './errorText';

export interface AppDefaults {
  /** The Pushbuttons panel offers "Bouncy" contacts (on unless the file says otherwise). */
  readonly bouncyButtons: boolean;
}

export const BUILT_IN_DEFAULTS: AppDefaults = { bouncyButtons: true };

/** Relative to the page, so every build (dev, GitHub Pages, Docker, Windows app) finds its own copy. */
export const APP_DEFAULTS_FILE = 'settings.json';

export interface ParsedDefaults {
  readonly defaults: AppDefaults;
  readonly warnings: readonly string[];
}

/** Each setting the file may hold, and the type its value must have. A new setting is one more line. */
const SETTING_TYPES: { readonly [K in keyof AppDefaults]: 'boolean' } = { bouncyButtons: 'boolean' };
const TYPE_TEXT = { boolean: 'true or false' } as const;
const IGNORED_KEYS = new Set(['$schema', '$comment']);
const builtIn = (warning: string): ParsedDefaults => ({ defaults: BUILT_IN_DEFAULTS, warnings: [warning] });
const isSetting = (key: string): key is keyof AppDefaults => Object.prototype.hasOwnProperty.call(SETTING_TYPES, key);

/** The file's settings over the built-in ones; anything unknown or mistyped is a warning, never an error. */
export function parseAppDefaults(text: string): ParsedDefaults {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return builtIn(`${APP_DEFAULTS_FILE} is not valid JSON: ${errorText(error)}.`);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return builtIn(`${APP_DEFAULTS_FILE} must hold an object, such as { "bouncyButtons": true }.`);
  }
  return parseEntries(Object.entries(raw));
}

function parseEntries(entries: readonly [string, unknown][]): ParsedDefaults {
  const warnings: string[] = [];
  const defaults: Record<string, unknown> = { ...BUILT_IN_DEFAULTS };
  for (const [key, value] of entries) {
    if (IGNORED_KEYS.has(key)) continue;
    if (!isSetting(key)) warnings.push(`${APP_DEFAULTS_FILE}: unknown setting "${key}" was ignored.`);
    else if (typeof value === SETTING_TYPES[key]) defaults[key] = value;
    else warnings.push(`${APP_DEFAULTS_FILE}: ${key} must be ${TYPE_TEXT[SETTING_TYPES[key]]}.`);
  }
  return { defaults: defaults as unknown as AppDefaults, warnings };
}

/** The defaults to start with; never throws. Not cached, so an edited file is read on the next start. */
export async function loadAppDefaults(fetchText: (url: string) => Promise<FetchedText> = fetchBoardFile): Promise<ParsedDefaults> {
  let fetched: FetchedText;
  try {
    fetched = await fetchText(APP_DEFAULTS_FILE);
  } catch (error) {
    fetched = { kind: 'failed', reason: errorText(error) };
  }
  if (fetched.kind === 'missing') return { defaults: BUILT_IN_DEFAULTS, warnings: [] };
  if (fetched.kind === 'failed') return builtIn(`${APP_DEFAULTS_FILE} could not be loaded: ${fetched.reason}.`);
  if (fetched.text.trim() === '') return builtIn(`${APP_DEFAULTS_FILE} could not be loaded: the file is empty.`);
  // A single-page host (and the dev server) answers a file it does not have with index.html: that is a missing file.
  if (/^\s*<!doctype html|^\s*<html/i.test(fetched.text)) return { defaults: BUILT_IN_DEFAULTS, warnings: [] };
  return parseAppDefaults(fetched.text);
}
