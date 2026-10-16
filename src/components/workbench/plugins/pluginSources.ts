// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The plugin VHDL files the Plugins page edits (docs/plugin_batch_implementation_plan.md
 * § 6.4, § 7.4). The shipped text is bundled into the frontend from
 * server/plugins/vhdl/, the single canonical copy. An edit is kept in this browser
 * with the hash of the shipped text it started from, so an update of HDLBoard that
 * changes that file is noticed (§ 7.4a) instead of silently replacing the user's work.
 *
 * While the page is on, a run sends every file of the enabled plugins under
 * `hdlboard/`, edited or not, so the frontend is the one source of truth for that run.
 * Pure, apart from the two localStorage helpers, which never throw.
 */

import hdlbPkgSource from '../../../../server/plugins/vhdl/hdlb_pkg.vhd?raw';
import uartMonitorSource from '../../../../server/plugins/vhdl/uart_monitor.vhd?raw';
import { pluginFilesFor } from './pluginCatalog';

/** Line endings as the editor keeps them, whatever the checkout's are. */
const toLf = (text: string) => text.replace(/\r\n/g, '\n');

export const SHIPPED_SOURCES: Readonly<Record<string, string>> = {
  'hdlb_pkg.vhd': toLf(hdlbPkgSource),
  'uart_monitor.vhd': toLf(uartMonitorSource),
};

/** Where plugin files travel in a `RUN` body; the server accepts only catalog names under it. */
export const PLUGIN_FILE_PREFIX = 'hdlboard/';

export interface PluginEdit {
  readonly text: string;
  /** `textHash` of the shipped text this edit started from. */
  readonly baseHash: string;
}

/** Edited files by plain file name. A file without an entry is the shipped one. */
export type PluginEdits = Readonly<Record<string, PluginEdit>>;

export type PluginFileStatus = 'shipped' | 'edited' | 'shippedChanged';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const HEX = 16;

/** FNV-1a, 32 bit: only has to tell two versions of one file apart, not resist anyone. */
export function textHash(text: string): string {
  let hash = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash.toString(HEX).padStart(8, '0');
}

const shipped = (name: string): string => SHIPPED_SOURCES[name] ?? '';

export function currentText(name: string, edits: PluginEdits): string {
  return edits[name]?.text ?? shipped(name);
}

export function fileStatus(name: string, edits: PluginEdits): PluginFileStatus {
  const edit = edits[name];
  if (edit === undefined) return 'shipped';
  return edit.baseHash === textHash(shipped(name)) ? 'edited' : 'shippedChanged';
}

/**
 * `edits` with `name` set to `text`. A text equal to the shipped one, on an unchanged
 * base, is no edit at all. An existing edit keeps its base: only Keep mine accepts a
 * newer shipped file.
 */
export function withEdit(edits: PluginEdits, name: string, text: string): PluginEdits {
  const baseHash = edits[name]?.baseHash ?? textHash(shipped(name));
  if (text === shipped(name) && baseHash === textHash(shipped(name))) return withoutEdit(edits, name);
  return { ...edits, [name]: { text, baseHash } };
}

/** Reset to shipped. */
export function withoutEdit(edits: PluginEdits, name: string): PluginEdits {
  if (!(name in edits)) return edits;
  const { [name]: _removed, ...rest } = edits;
  return rest;
}

/** Keep mine: the edit is now based on the shipped file as it is. */
export function withShippedAccepted(edits: PluginEdits, name: string): PluginEdits {
  const edit = edits[name];
  return edit === undefined ? edits : { ...edits, [name]: { text: edit.text, baseHash: textHash(shipped(name)) } };
}

/** The plugin files one run sends: every file the enabled plugins need, as the page shows it. */
export function pluginRunFiles(enabledIds: ReadonlySet<string>, edits: PluginEdits): Array<{ name: string; content: string }> {
  return pluginFilesFor(enabledIds).map((name) => ({ name: `${PLUGIN_FILE_PREFIX}${name}`, content: currentText(name, edits) }));
}

/** The console line for edits whose shipped file has changed since, or nothing (§ 7.4a). */
export function shippedChangedNotice(enabledIds: ReadonlySet<string>, edits: PluginEdits): string | undefined {
  const changed = pluginFilesFor(enabledIds).filter((name) => fileStatus(name, edits) === 'shippedChanged');
  return changed.length > 0 ? `Plugins: shipped file changed since your edit: ${changed.join(', ')}` : undefined;
}

const STORAGE_KEY = 'hdlboard.pluginEdits.v1';

const isEdit = (v: unknown): v is PluginEdit =>
  typeof v === 'object' && v !== null && typeof (v as PluginEdit).text === 'string' && typeof (v as PluginEdit).baseHash === 'string';

/** The stored edits of known plugin files; anything else is ignored. */
export function parsePluginEdits(json: string | null): PluginEdits {
  try {
    const raw: unknown = JSON.parse(json ?? 'null');
    if (typeof raw !== 'object' || raw === null) return {};
    return Object.fromEntries(Object.entries(raw).filter(([name, edit]) => name in SHIPPED_SOURCES && isEdit(edit)));
  } catch {
    return {};
  }
}

export function loadPluginEdits(): PluginEdits {
  try {
    return parsePluginEdits(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
}

export function savePluginEdits(edits: PluginEdits): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(edits));
  } catch {
    // Storage blocked or full: the edit lasts until the page is closed.
  }
}
