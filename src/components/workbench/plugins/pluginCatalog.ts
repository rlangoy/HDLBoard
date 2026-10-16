// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The plugins shipped with HDLBoard, as the frontend needs them: for the Settings
 * checkboxes, the `PLUGINS` verb and the Plugins page (docs/plugin_batch_implementation_plan.md
 * § 3.6). A copy of server/src/pluginCatalog.ts, which this package cannot import; both
 * are checked against tests/fixtures/plugins/pluginCatalog.json. Pure.
 */

export interface PluginInfo {
  /** Stable id used in settings and the `PLUGINS` verb. Lower case. */
  readonly id: string;
  readonly title: string;
  /** One line for the settings list. Frontend only. */
  readonly description: string;
  /** Line kinds this plugin prints (`@@HDLB <kind> ...`). */
  readonly kinds: readonly string[];
  /** VHDL entities it adds to the library `hdlboard`. */
  readonly entities: readonly string[];
  /** Source files in analysis order. */
  readonly files: readonly string[];
  readonly defaultEnabled: boolean;
}

/** Always analysed when the library is used; holds `hdlb_emit`. Not a plugin of its own. */
export const SHARED_FILES: readonly string[] = ['hdlb_pkg.vhd'];

export const PLUGIN_CATALOG: readonly PluginInfo[] = [
  {
    id: 'rs232',
    title: 'RS232 (UART)',
    description: 'hdlboard.uart_monitor: decodes a serial line (8N1) and shows the bytes it receives.',
    kinds: ['uart'],
    entities: ['uart_monitor'],
    files: ['uart_monitor.vhd'],
    defaultEnabled: true,
  },
];

export function defaultPluginIds(catalog: readonly PluginInfo[] = PLUGIN_CATALOG): string[] {
  return catalog.filter((p) => p.defaultEnabled).map((p) => p.id);
}

/** The files a run needs with these plugins: the shared package, then each plugin's in catalog order. */
export function pluginFilesFor(enabledIds: ReadonlySet<string>, catalog: readonly PluginInfo[] = PLUGIN_CATALOG): string[] {
  return [...SHARED_FILES, ...catalog.filter((p) => enabledIds.has(p.id)).flatMap((p) => p.files)];
}

/** Every file of the catalog, in the order the Plugins page lists them. */
export function allPluginFiles(catalog: readonly PluginInfo[] = PLUGIN_CATALOG): string[] {
  return [...SHARED_FILES, ...catalog.flatMap((p) => p.files)];
}
