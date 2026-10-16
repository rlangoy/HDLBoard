// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import catalogFixture from '../../../../tests/fixtures/plugins/pluginCatalog.json';
import frameFixture from '../../../../tests/fixtures/plugins/pluginFrames.json';
import { PLUGIN_CATALOG, SHARED_FILES, allPluginFiles, pluginFilesFor } from './pluginCatalog';
import { decodePluginFrame, hdlbLine, type PluginLine } from './pluginFrame';
import { PluginLog } from './pluginLog';
import { DEFAULT_PLUGIN_PREFS, parsePluginPrefs, serializePluginPrefs } from './pluginPrefs';
import {
  SHIPPED_SOURCES,
  currentText,
  fileStatus,
  parsePluginEdits,
  pluginRunFiles,
  shippedChangedNotice,
  textHash,
  withEdit,
  withShippedAccepted,
  withoutEdit,
  type PluginEdits,
} from './pluginSources';

/** `handleFrame`'s split: the text after `PLUGIN `, and the body after the first newline. */
function splitFrame(frame: string): { inline: string; body: string } {
  const nl = frame.indexOf('\n');
  const head = nl === -1 ? frame : frame.slice(0, nl);
  return { inline: head.slice('PLUGIN '.length), body: nl === -1 ? '' : frame.slice(nl + 1) };
}

const line = (kind: string, instance: string, timeNs: number, payload = '48'): PluginLine => ({ kind, instance, timeNs, payload });

describe('the PLUGIN frame (shared fixture with the server)', () => {
  test.each(frameFixture.valid.map((c) => [c.why, c] as const))('decodes %s', (_why, { frame, line: expected }) => {
    const { inline, body } = splitFrame(frame);
    expect(decodePluginFrame(inline, body)).toEqual(expected);
  });

  test.each(frameFixture.invalid.map((c) => [c.why, c] as const))('rejects %s', (_why, { frame }) => {
    const { inline, body } = splitFrame(frame);
    expect(decodePluginFrame(inline, body)).toBeUndefined();
  });

  test('a line copies back in the form hdlb_emit printed it', () => {
    expect(hdlbLine(line('uart', 'TX', 83495))).toBe('@@HDLB uart TX 83495 48');
  });
});

describe('the catalog copy', () => {
  test('matches the shared fixture the server catalog is checked against', () => {
    expect(SHARED_FILES).toEqual(catalogFixture.sharedFiles);
    expect(PLUGIN_CATALOG.map(({ description: _d, ...shared }) => shared)).toEqual(catalogFixture.plugins);
  });

  test('a run needs the shared package first, then the files of the enabled plugins only', () => {
    expect(pluginFilesFor(new Set(['rs232']))).toEqual(['hdlb_pkg.vhd', 'uart_monitor.vhd']);
    expect(pluginFilesFor(new Set())).toEqual(['hdlb_pkg.vhd']);
  });

  test('every catalog file is bundled', () => {
    for (const name of allPluginFiles()) expect(SHIPPED_SOURCES[name], name).toMatch(/SPDX-License-Identifier/);
  });
});

describe('PluginLog', () => {
  test('keeps entries per kind and instance and merges them in arrival order', () => {
    const log = new PluginLog();
    log.add(line('uart', 'TX', 1));
    log.add(line('uart', 'RX', 2));
    log.add(line('uart', 'TX', 3));
    expect(log.rows().map((r) => [r.instance, r.timeNs])).toEqual([['TX', 1], ['RX', 2], ['TX', 3]]);
    expect(log.instanceLogs().map((l) => l.instance)).toEqual(['TX', 'RX']);
  });

  test('the same instance name with another kind is another instance', () => {
    const log = new PluginLog();
    log.add(line('uart', 'A', 1));
    log.add(line('spi', 'A', 2));
    expect(log.instanceLogs()).toHaveLength(2);
  });

  test('drops the oldest entries over the limit and counts them', () => {
    const log = new PluginLog(10);
    for (let i = 0; i < 25; i++) log.add(line('uart', 'TX', i));
    const kept = log.rows();
    expect(kept.length).toBeLessThanOrEqual(10);
    expect(kept.length + log.dropped).toBe(25);
    expect(kept[kept.length - 1].timeNs).toBe(24);
  });

  test('a flooding instance cannot evict another one', () => {
    const log = new PluginLog(10);
    log.add(line('uart', 'RX', 0));
    for (let i = 0; i < 100; i++) log.add(line('uart', 'TX', i));
    expect(log.rows().filter((r) => r.instance === 'RX')).toHaveLength(1);
  });

  test('clear empties it for a new run', () => {
    const log = new PluginLog();
    log.add(line('uart', 'TX', 1));
    log.clear();
    expect(log.isEmpty).toBe(true);
    expect(log.rows()).toEqual([]);
  });

  test('an unknown kind and an invalid payload are kept as they came', () => {
    const log = new PluginLog();
    log.add(line('myplug', 'A', 5, 'not hex at all'));
    expect(log.rows()[0]).toMatchObject({ kind: 'myplug', payload: 'not hex at all' });
  });
});

describe('plugin preferences', () => {
  test('nothing stored: the catalog defaults, page off', () => {
    expect(parsePluginPrefs(null)).toEqual(DEFAULT_PLUGIN_PREFS);
    expect(DEFAULT_PLUGIN_PREFS.showPage).toBe(false);
  });

  test('round-trips a plugin switched off and the page switched on', () => {
    const prefs = { enabledIds: new Set<string>(), showPage: true };
    expect(parsePluginPrefs(serializePluginPrefs(prefs))).toEqual(prefs);
  });

  test('a plugin in neither stored list starts at its default', () => {
    expect(parsePluginPrefs(JSON.stringify({ enabled: [], disabled: [] })).enabledIds).toEqual(new Set(['rs232']));
  });

  test('malformed storage falls back to the defaults', () => {
    expect(parsePluginPrefs('{not json')).toEqual(DEFAULT_PLUGIN_PREFS);
  });
});

describe('plugin sources', () => {
  const NAME = 'uart_monitor.vhd';
  const shippedText = SHIPPED_SOURCES[NAME];

  test('a file starts as the shipped text', () => {
    expect(currentText(NAME, {})).toBe(shippedText);
    expect(fileStatus(NAME, {})).toBe('shipped');
  });

  test('an edit is used and marked', () => {
    const edits = withEdit({}, NAME, '-- mine');
    expect(currentText(NAME, edits)).toBe('-- mine');
    expect(fileStatus(NAME, edits)).toBe('edited');
  });

  test('editing back to the shipped text is no edit', () => {
    expect(withEdit(withEdit({}, NAME, '-- mine'), NAME, shippedText)).toEqual({});
  });

  test('reset to shipped restores the shipped text', () => {
    expect(currentText(NAME, withoutEdit(withEdit({}, NAME, '-- mine'), NAME))).toBe(shippedText);
  });

  test('a shipped file that changed since the edit is marked and the edit is kept', () => {
    const edits: PluginEdits = { [NAME]: { text: '-- mine', baseHash: textHash('-- an older shipped file') } };
    expect(fileStatus(NAME, edits)).toBe('shippedChanged');
    expect(currentText(NAME, edits)).toBe('-- mine');
    expect(shippedChangedNotice(new Set(['rs232']), edits)).toBe('Plugins: shipped file changed since your edit: uart_monitor.vhd');
  });

  test('keep mine accepts the new shipped file as the base', () => {
    const edits: PluginEdits = { [NAME]: { text: '-- mine', baseHash: 'stale' } };
    expect(fileStatus(NAME, withShippedAccepted(edits, NAME))).toBe('edited');
  });

  test('a run sends every file of the enabled plugins, edited or not, and none of a disabled one', () => {
    const edits = withEdit({}, NAME, '-- mine');
    expect(pluginRunFiles(new Set(['rs232']), edits)).toEqual([
      { name: 'hdlboard/hdlb_pkg.vhd', content: SHIPPED_SOURCES['hdlb_pkg.vhd'] },
      { name: 'hdlboard/uart_monitor.vhd', content: '-- mine' },
    ]);
    expect(pluginRunFiles(new Set(), edits).map((f) => f.name)).toEqual(['hdlboard/hdlb_pkg.vhd']);
  });

  test('stored edits of unknown files are ignored', () => {
    const stored = JSON.stringify({ [NAME]: { text: 'a', baseHash: 'b' }, 'evil.vhd': { text: 'c', baseHash: 'd' } });
    expect(Object.keys(parsePluginEdits(stored))).toEqual([NAME]);
  });
});
