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

export interface AppDefaults {
  /** The Pushbuttons panel offers "Bouncy" contacts (on unless the file says otherwise). */
  readonly bouncyButtons: boolean;
}

export const BUILT_IN_DEFAULTS: AppDefaults = { bouncyButtons: true };

/** Relative to the page, so every build (dev, GitHub Pages, Docker, Windows app) finds its own copy. */
export const APP_DEFAULTS_FILE = 'settings.json';
const HTTP_NOT_FOUND = 404;

export interface ParsedDefaults {
  readonly defaults: AppDefaults;
  readonly warnings: readonly string[];
}

const IGNORED_KEYS = new Set(['$schema', '$comment']);
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The file's settings over the built-in ones; anything unknown or mistyped is a warning, never an error. */
export function parseAppDefaults(text: string): ParsedDefaults {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { defaults: BUILT_IN_DEFAULTS, warnings: [`${APP_DEFAULTS_FILE} is not valid JSON: ${errorText(error)}.`] };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { defaults: BUILT_IN_DEFAULTS, warnings: [`${APP_DEFAULTS_FILE} must hold an object, such as { "bouncyButtons": true }.`] };
  }
  return parseEntries(Object.entries(raw));
}

function parseEntries(entries: readonly [string, unknown][]): ParsedDefaults {
  const warnings: string[] = [];
  let bouncyButtons = BUILT_IN_DEFAULTS.bouncyButtons;
  for (const [key, value] of entries) {
    if (IGNORED_KEYS.has(key)) continue;
    if (key !== 'bouncyButtons') warnings.push(`${APP_DEFAULTS_FILE}: unknown setting "${key}" was ignored.`);
    else if (typeof value === 'boolean') bouncyButtons = value;
    else warnings.push(`${APP_DEFAULTS_FILE}: bouncyButtons must be true or false.`);
  }
  return { defaults: { bouncyButtons }, warnings };
}

export type FetchDefaults = (url: string) => Promise<{ status: number; ok: boolean; text: () => Promise<string> }>;

/** The defaults to start with; never throws. Not cached, so an edited file is read on the next start. */
export async function loadAppDefaults(fetchFile: FetchDefaults = (url) => fetch(url, { cache: 'no-cache' })): Promise<ParsedDefaults> {
  try {
    const response = await fetchFile(APP_DEFAULTS_FILE);
    if (response.status === HTTP_NOT_FOUND) return { defaults: BUILT_IN_DEFAULTS, warnings: [] };
    if (!response.ok) return { defaults: BUILT_IN_DEFAULTS, warnings: [`${APP_DEFAULTS_FILE} could not be loaded: HTTP ${response.status}.`] };
    const text = await response.text();
    // A dev server or single-page host may answer a missing file with index.html.
    if (text.trim() === '' || text.trimStart().startsWith('<')) return { defaults: BUILT_IN_DEFAULTS, warnings: [] };
    return parseAppDefaults(text);
  } catch (error) {
    return { defaults: BUILT_IN_DEFAULTS, warnings: [`${APP_DEFAULTS_FILE} could not be loaded: ${errorText(error)}.`] };
  }
}
