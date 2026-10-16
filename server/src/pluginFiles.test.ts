// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PluginInfo } from './pluginCatalog.js';
import { MAX_PLUGIN_FILE_BYTES, splitRunFiles } from './pluginFiles.js';

const CATALOG: readonly PluginInfo[] = [
  { id: 'rs232', title: 'RS232 (UART)', kinds: ['uart'], entities: ['uart_monitor'], files: ['uart_monitor.vhd'], defaultEnabled: true },
  { id: 'i2c', title: 'I2C', kinds: ['i2c'], entities: ['i2c_monitor'], files: ['i2c_monitor.vhd'], defaultEnabled: false },
];

const file = (name: string, content = '-- vhdl') => ({ name, content });

describe('splitRunFiles', () => {
  test('PF-1: student files without the prefix are passed through unchanged', () => {
    const result = splitRunFiles([file('top.vhd'), file('top_tb.vhd')], ['rs232'], CATALOG);
    assert.deepEqual(result, { studentFiles: [file('top.vhd'), file('top_tb.vhd')], pluginFiles: [] });
  });

  test('PF-2: plugin files lose the prefix and are kept apart from the student files', () => {
    const result = splitRunFiles([file('top.vhd'), file('hdlboard/hdlb_pkg.vhd'), file('hdlboard/uart_monitor.vhd')], ['rs232'], CATALOG);
    assert.deepEqual(result, { studentFiles: [file('top.vhd')], pluginFiles: [file('hdlb_pkg.vhd'), file('uart_monitor.vhd')] });
  });

  test('PF-3: a name under the prefix that is not a catalog file is refused', () => {
    const result = splitRunFiles([file('hdlboard/top.vhd')], ['rs232'], CATALOG);
    assert.ok('message' in result && result.message.startsWith('hdlboard/top.vhd is not a plugin file'));
  });

  test('PF-4: a path that tries to leave the prefix is refused', () => {
    const result = splitRunFiles([file('hdlboard/../top.vhd')], ['rs232'], CATALOG);
    assert.ok('message' in result);
  });

  test('PF-5: a file over the size cap is refused', () => {
    const result = splitRunFiles([file('hdlboard/uart_monitor.vhd', 'x'.repeat(MAX_PLUGIN_FILE_BYTES + 1))], ['rs232'], CATALOG);
    assert.ok('message' in result && result.message.includes('larger than'));
  });

  test('PF-6: files of a disabled plugin are ignored, the shared package is kept', () => {
    const result = splitRunFiles([file('hdlboard/hdlb_pkg.vhd'), file('hdlboard/uart_monitor.vhd')], [], CATALOG);
    assert.deepEqual(result, { studentFiles: [], pluginFiles: [file('hdlb_pkg.vhd')] });
  });
});
