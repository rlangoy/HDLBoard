// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

// Server-side test: Node's own runner, like the rest of server/ (server/scripts/run-tests.mjs).

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { decodePluginFrame, encodePluginFrame, parsePluginLine, routeOutputLine } from './pluginLine.js';

describe('parsePluginLine', () => {
  test('P-1: parses a uart byte', () => {
    assert.deepEqual(parsePluginLine('@@HDLB uart TX 83495 48'), { kind: 'uart', instance: 'TX', timeNs: 83495, payload: '48' });
  });

  test('P-2: keeps the payload verbatim, spaces included', () => {
    assert.equal(parsePluginLine('@@HDLB uart RX 92465 00 FE')?.payload, '00 FE');
  });

  test('P-3: accepts an empty payload', () => {
    assert.equal(parsePluginLine('@@HDLB uart RX 0')?.payload, '');
  });

  test('P-4: accepts timestamps beyond 2**31 ns', () => {
    assert.equal(parsePluginLine('@@HDLB uart RX 3000179270 FF')?.timeNs, 3000179270);
  });

  const rejected: Array<[string, string]> = [
    ['report output', 'tb.vhd:27:5:@1us:(report note): @@HDLB uart TX 1 48'],
    ['no prefix', 'uart TX 1 48'],
    ['prefix not in column 1', ' @@HDLB uart TX 1 48'],
    ['missing time', '@@HDLB uart TX'],
    ['non-numeric time', '@@HDLB uart TX 12a 48'],
    ['time glued to payload', '@@HDLB uart TX 12abc'],
    ['invalid instance name', '@@HDLB uart 1TX 1 48'],
    ['time beyond 2**53', '@@HDLB uart TX 9999999999999999 48'],
  ];
  for (const [label, text] of rejected) {
    test(`P-5: rejects ${label}`, () => {
      assert.equal(parsePluginLine(text), undefined);
    });
  }
});

describe('routeOutputLine', () => {
  test('P-6: plugin lines go to the plugin, everything else to the log', () => {
    assert.equal(routeOutputLine('@@HDLB uart TX 1 48').to, 'plugin');
    assert.deepEqual(routeOutputLine('simulation finished @368350ns'), { to: 'log', text: 'simulation finished @368350ns' });
  });

  test('P-7: a malformed plugin line goes to the log, so nothing disappears', () => {
    assert.deepEqual(routeOutputLine('@@HDLB broken'), { to: 'log', text: '@@HDLB broken' });
  });
});

describe('PLUGIN frame', () => {
  test('P-8: round-trips through encode and decode', () => {
    const line = { kind: 'uart', instance: 'RX', timeNs: 92465, payload: '00 FE' };
    const text = encodePluginFrame(line);
    assert.equal(text, 'PLUGIN uart RX 92465\n00 FE');
    const nl = text.indexOf('\n');
    assert.deepEqual(decodePluginFrame(text.slice('PLUGIN '.length, nl), text.slice(nl + 1)), line);
  });

  test('P-9: rejects a malformed header', () => {
    assert.ok('message' in decodePluginFrame('uart RX', '48'));
  });
});
