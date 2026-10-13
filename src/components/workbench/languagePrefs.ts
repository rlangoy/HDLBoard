// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The languages the student works in (Settings › Languages): the Examples pane
 * opens with these ticked. Stored in localStorage, which the desktop app keeps
 * between launches as the browser does. Pure, apart from the two localStorage
 * helpers, which never throw.
 */

import { EXAMPLE_LANGUAGES, type ExampleLanguage } from './examples';

export type PreferredLanguages = ReadonlySet<ExampleLanguage>;

/** Both, until the student chooses: a fresh install shows every example. */
export const DEFAULT_LANGUAGES: PreferredLanguages = new Set(EXAMPLE_LANGUAGES);

const STORAGE_KEY = 'hdlboard.languages.v1';

const isLanguage = (v: unknown): v is ExampleLanguage => EXAMPLE_LANGUAGES.includes(v as ExampleLanguage);

/**
 * The stored languages: a stored list is the choice, an empty one too (both boxes cleared);
 * nothing stored, or anything that is not a list, falls back to both.
 */
export function parsePreferredLanguages(json: string | null): PreferredLanguages {
  try {
    const raw: unknown = JSON.parse(json ?? 'null');
    return Array.isArray(raw) ? new Set(raw.filter(isLanguage)) : DEFAULT_LANGUAGES;
  } catch {
    return DEFAULT_LANGUAGES;
  }
}

/** Stored in the order the Examples pane lists them, so the JSON is stable. */
export function serializePreferredLanguages(languages: PreferredLanguages): string {
  return JSON.stringify(EXAMPLE_LANGUAGES.filter((language) => languages.has(language)));
}

export function loadPreferredLanguages(): PreferredLanguages {
  try {
    return parsePreferredLanguages(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_LANGUAGES;
  }
}

export function savePreferredLanguages(languages: PreferredLanguages): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, serializePreferredLanguages(languages));
  } catch {
    // Storage blocked or full: the choice just isn't remembered.
  }
}
