// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { PLUGIN_CATALOG } from './pluginCatalog';
import type { PluginPrefs } from './pluginPrefs';

export interface PluginSettingsProps {
  value: PluginPrefs;
  onChange: (prefs: PluginPrefs) => void;
}

/** `prefs` with plugin `id` switched on or off. */
export function withPluginEnabled(prefs: PluginPrefs, id: string, enabled: boolean): PluginPrefs {
  const enabledIds = new Set(prefs.enabledIds);
  if (enabled) enabledIds.add(id);
  else enabledIds.delete(id);
  return { ...prefs, enabledIds };
}

/**
 * Settings › Plugins (docs/plugin_batch_implementation_plan.md § 3.6, § 7.4): a checkbox
 * per shipped plugin, and the switch for the Plugins page. A disabled plugin behaves as
 * if it were not installed; the choice applies from the next run.
 */
export function PluginSettings({ value, onChange }: PluginSettingsProps) {
  return (
    <fieldset className="wb-settings__group">
      <legend className="wb-settings__heading">Plugins</legend>
      {PLUGIN_CATALOG.map((plugin) => (
        <label key={plugin.id} className="wb-settings__option">
          <input
            type="checkbox"
            checked={value.enabledIds.has(plugin.id)}
            onChange={(e) => onChange(withPluginEnabled(value, plugin.id, e.target.checked))}
          />
          <span>
            <strong>{plugin.title}</strong>
            <span className="wb-settings__note">{plugin.description}</span>
          </span>
        </label>
      ))}
      <label className="wb-settings__option">
        <input type="checkbox" checked={value.showPage} onChange={(e) => onChange({ ...value, showPage: e.target.checked })} />
        <span>
          <strong>Show the Plugins page (edit plugin files)</strong>
          <span className="wb-settings__note">
            Read and change the plugin VHDL files. While this is on, your edited files are used in every run; turned
            off, the shipped files are used and your edits are kept for later.
          </span>
        </span>
      </label>
      <span className="wb-settings__note">
        A testbench uses a plugin with <code>library hdlboard;</code> and, for example,{' '}
        <code>entity hdlboard.uart_monitor</code>. Changes apply from the next run.
      </span>
    </fieldset>
  );
}
