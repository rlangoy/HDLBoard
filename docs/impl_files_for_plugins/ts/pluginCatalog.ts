// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * PROPOSAL - not wired in. The table of plugins shipped with HDLBoard
 * (../../plugin_batch_implementation_plan.md, "Enabling and disabling plugins").
 * Intended home: server/src/pluginCatalog.ts.
 *
 * This is HDLBoard's own table, one row per shipped plugin - not plugin configuration:
 * the plugin's VHDL stays free of settings (decision B2). The frontend needs the same
 * ids and titles for its Plugins settings; it takes them from the server or keeps a
 * copy that the shared test keeps in step. Pure.
 */

export interface PluginInfo {
  /** Stable id used in settings, the `PLUGINS` verb and messages. Lower case. */
  readonly id: string;
  /** Name in the settings UI and in messages. */
  readonly title: string;
  /** Line kinds this plugin prints (`@@HDLB <kind> ...`). */
  readonly kinds: readonly string[];
  /** VHDL entities it adds to the library `hdlboard`. */
  readonly entities: readonly string[];
  /** Source files in analysis order, relative to the plugin root. */
  readonly files: readonly string[];
  /** On unless the user turns it off. */
  readonly defaultEnabled: boolean;
}

/** Always analysed when the library is used; holds `hdlb_emit`. Not a plugin of its own. */
export const SHARED_FILES: readonly string[] = ['hdlb_pkg.vhd'];

export const PLUGIN_CATALOG: readonly PluginInfo[] = [
  { id: 'rs232', title: 'RS232 (UART)', kinds: ['uart'], entities: ['uart_monitor'], files: ['uart_monitor.vhd'], defaultEnabled: true },
  // Later (see "Beyond RS232"): i2c, spi, onewire.
];

/** The ids a run uses when the client never sent `PLUGINS`. */
export function defaultPluginIds(catalog: readonly PluginInfo[] = PLUGIN_CATALOG): string[] {
  return catalog.filter((p) => p.defaultEnabled).map((p) => p.id);
}

/** The kinds of the catalog plugins that are not in `ids`. Unknown ids are ignored. */
export function disabledKinds(enabledIds: readonly string[], catalog: readonly PluginInfo[] = PLUGIN_CATALOG): Set<string> {
  return new Set(catalog.filter((p) => !enabledIds.includes(p.id)).flatMap((p) => p.kinds));
}

/**
 * The files to analyse into `hdlboard`, in order: the shared package first, then the
 * files of each enabled plugin in catalog order. With no plugin enabled only the
 * package is analysed, so `library hdlboard;` still resolves and the student gets the
 * precise "unit ... not found" error that `disabledPluginHint` then explains.
 */
export function filesToAnalyse(ids: readonly string[], catalog: readonly PluginInfo[] = PLUGIN_CATALOG): string[] {
  return [...SHARED_FILES, ...catalog.filter((p) => ids.includes(p.id)).flatMap((p) => p.files)];
}

const MISSING_UNIT = /unit "([A-Za-z_][A-Za-z0-9_]*)" not found in library "hdlboard"/gi;

/**
 * An extra paragraph for GHDL's analysis error when the student instantiated a plugin
 * entity that is not in the library: switched off, or not a plugin entity at all.
 * `undefined` when the error is not about the library `hdlboard`.
 */
export function disabledPluginHint(
  ghdlError: string,
  enabledIds: readonly string[],
  catalog: readonly PluginInfo[] = PLUGIN_CATALOG,
): string | undefined {
  const notes: string[] = [];
  for (const match of ghdlError.matchAll(MISSING_UNIT)) {
    const entity = match[1].toLowerCase();
    const owner = catalog.find((p) => p.entities.includes(entity));
    if (owner === undefined) {
      const known = catalog.flatMap((p) => p.entities).join(', ');
      notes.push(`"${match[1]}" is not a plugin entity. Available in library hdlboard: ${known}.`);
    } else if (!enabledIds.includes(owner.id)) {
      notes.push(`The plugin "${owner.title}" is disabled. Enable it in Settings > Plugins and run again.`);
    }
  }
  return notes.length > 0 ? [...new Set(notes)].join('\n') : undefined;
}
