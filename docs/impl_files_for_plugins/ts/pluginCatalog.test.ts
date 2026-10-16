// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

// Server-side test: Node's own runner, like the rest of server/ (server/scripts/run-tests.mjs).

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { defaultPluginIds, disabledPluginHint, enabledKinds, filesToAnalyse, type PluginInfo } from './pluginCatalog.js';
import { parsePluginIds, routeOutputLine } from './pluginLine.js';

const CATALOG: readonly PluginInfo[] = [
  { id: 'rs232', title: 'RS232 (UART)', kinds: ['uart'], entities: ['uart_monitor'], files: ['uart_monitor.vhd'], defaultEnabled: true },
  { id: 'i2c', title: 'I2C', kinds: ['i2c'], entities: ['i2c_monitor'], files: ['i2c_monitor.vhd'], defaultEnabled: false },
];

describe('catalog', () => {
  test('C-1: default ids are those marked default', () => {
    assert.deepEqual(defaultPluginIds(CATALOG), ['rs232']);
  });

  test('C-2: enabled kinds are the union of the enabled plugins; unknown ids are ignored', () => {
    assert.deepEqual([...enabledKinds(['rs232', 'i2c', 'nope'], CATALOG)].sort(), ['i2c', 'uart']);
    assert.equal(enabledKinds([], CATALOG).size, 0);
  });

  test('C-3: the shared package is always analysed first; disabled plugins are left out', () => {
    assert.deepEqual(filesToAnalyse(['rs232'], CATALOG), ['hdlb_pkg.vhd', 'uart_monitor.vhd']);
    assert.deepEqual(filesToAnalyse([], CATALOG), ['hdlb_pkg.vhd']);
  });
});

describe('disabledPluginHint', () => {
  const error = (unit: string) => `t.vhd:5:22:error: unit "${unit}" not found in library "hdlboard"`;

  test('C-4: explains a disabled plugin', () => {
    assert.match(disabledPluginHint(error('uart_monitor'), [], CATALOG) ?? '', /"RS232 \(UART\)" is disabled/);
  });

  test('C-5: matches the entity name case-insensitively', () => {
    assert.match(disabledPluginHint(error('UART_Monitor'), [], CATALOG) ?? '', /disabled/);
  });

  test('C-6: no hint when the plugin is enabled (the error is something else)', () => {
    assert.equal(disabledPluginHint(error('uart_monitor'), ['rs232'], CATALOG), undefined);
  });

  test('C-7: a name that is no plugin entity lists the available ones', () => {
    assert.match(disabledPluginHint(error('uart_monitr'), ['rs232'], CATALOG) ?? '', /not a plugin entity.*uart_monitor, i2c_monitor/);
  });

  test('C-8: no hint for unrelated errors', () => {
    assert.equal(disabledPluginHint('t.vhd:1:1:error: unit "x" not found in library "work"', [], CATALOG), undefined);
  });
});

describe('enabled plugins and routing', () => {
  const line = '@@HDLB i2c BUS 30000 S';

  test('C-9: a line of a disabled kind is ordinary output', () => {
    assert.equal(routeOutputLine(line, enabledKinds(['rs232'], CATALOG)).to, 'log');
  });

  test('C-10: a line of an enabled kind is routed to the plugin', () => {
    assert.equal(routeOutputLine(line, enabledKinds(['i2c'], CATALOG)).to, 'plugin');
  });

  test('C-11: without an enabled set every kind is accepted', () => {
    assert.equal(routeOutputLine(line).to, 'plugin');
  });
});

describe('parsePluginIds', () => {
  test('C-12: parses a list, removes duplicates, accepts an empty list', () => {
    assert.deepEqual(parsePluginIds('rs232,i2c,rs232'), ['rs232', 'i2c']);
    assert.deepEqual(parsePluginIds(''), []);
  });

  test('C-13: rejects invalid ids and too many ids', () => {
    for (const bad of ['RS232', 'rs 232', 'rs232,', ',rs232', '1abc', 'a;b']) {
      assert.ok('message' in (parsePluginIds(bad) as object), bad);
    }
    assert.ok('message' in (parsePluginIds(Array.from({ length: 33 }, (_, i) => `p${i}`).join(',')) as object));
  });
});
