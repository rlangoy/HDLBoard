// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Settings › Plugins (docs/plugin_batch_implementation_plan.md § 3.6, § 7.4): which
 * plugins are enabled, and whether the Plugins page is shown. Stored in this browser,
 * like the other settings. Pure, apart from the two localStorage helpers, which never
 * throw.
 */

import { PLUGIN_CATALOG, defaultPluginIds, type PluginInfo } from './pluginCatalog';

export interface PluginPrefs {
  /** Ids of the catalog plugins that are switched on. */
  readonly enabledIds: ReadonlySet<string>;
  /** The Plugins page (edit plugin files) is off until the user turns it on. */
  readonly showPage: boolean;
}

export const DEFAULT_PLUGIN_PREFS: PluginPrefs = { enabledIds: new Set(defaultPluginIds()), showPage: false };

const STORAGE_KEY = 'hdlboard.plugins.v1';

/** Both lists are stored, so a plugin added in a later version, in neither, starts at its own default. */
interface StoredPrefs {
  enabled?: unknown;
  disabled?: unknown;
  showPage?: unknown;
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** The stored settings; anything missing or malformed falls back to the defaults. */
export function parsePluginPrefs(json: string | null, catalog: readonly PluginInfo[] = PLUGIN_CATALOG): PluginPrefs {
  try {
    const raw = JSON.parse(json ?? 'null') as StoredPrefs | null;
    if (raw === null || typeof raw !== 'object') return DEFAULT_PLUGIN_PREFS;
    const enabled = new Set(isStringArray(raw.enabled) ? raw.enabled : []);
    const disabled = new Set(isStringArray(raw.disabled) ? raw.disabled : []);
    const isOn = (p: PluginInfo) => enabled.has(p.id) || (p.defaultEnabled && !disabled.has(p.id));
    return { enabledIds: new Set(catalog.filter(isOn).map((p) => p.id)), showPage: raw.showPage === true };
  } catch {
    return DEFAULT_PLUGIN_PREFS;
  }
}

export function serializePluginPrefs(prefs: PluginPrefs, catalog: readonly PluginInfo[] = PLUGIN_CATALOG): string {
  const ids = (on: boolean) => catalog.filter((p) => prefs.enabledIds.has(p.id) === on).map((p) => p.id);
  return JSON.stringify({ enabled: ids(true), disabled: ids(false), showPage: prefs.showPage });
}

export function loadPluginPrefs(): PluginPrefs {
  try {
    return parsePluginPrefs(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_PLUGIN_PREFS;
  }
}

export function savePluginPrefs(prefs: PluginPrefs): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, serializePluginPrefs(prefs));
  } catch {
    // Storage blocked or full: the choice just isn't remembered.
  }
}
