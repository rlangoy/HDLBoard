// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

// Server-side test: Node's own runner, like the rest of server/ (server/scripts/run-tests.mjs).

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  decodePluginFrame,
  encodePluginFrame,
  MAX_PAYLOAD_LENGTH,
  parsePluginLine,
  routeOutputLine,
  usesHdlboardLibrary,
} from './pluginLine.js';

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

  test('P-4b: accepts a payload of exactly the maximum length', () => {
    assert.equal(parsePluginLine(`@@HDLB uart TX 1 ${'x'.repeat(MAX_PAYLOAD_LENGTH)}`)?.payload.length, MAX_PAYLOAD_LENGTH);
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
    ['trailing carriage return', '@@HDLB uart TX 1 48\r'],
    ['tab in payload', '@@HDLB uart TX 1 4\t8'],
    ['NUL in payload', '@@HDLB uart TX 1 4\u00008'],
    ['non-ASCII payload', '@@HDLB uart TX 1 æøå'],
    ['payload over the limit', `@@HDLB uart TX 1 ${'x'.repeat(MAX_PAYLOAD_LENGTH + 1)}`],
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

  test('P-10: applies the payload rule to the frame body too', () => {
    assert.ok('message' in decodePluginFrame('uart RX 1', 'a\nb'));
    assert.ok('message' in decodePluginFrame('uart RX 1', 'x'.repeat(MAX_PAYLOAD_LENGTH + 1)));
    assert.ok(!('message' in decodePluginFrame('uart RX 1', '')));
  });
});

describe('usesHdlboardLibrary', () => {
  const yes: Array<[string, string]> = [
    ['plain', 'library hdlboard;'],
    ['mixed case and spacing', 'LIBRARY   HdlBoard ;'],
    ['in a list', 'library ieee, hdlboard;'],
    ['over several lines', 'library ieee,\n  hdlboard\n;'],
    ['after a comment that contains a quote', `-- don't "quote\nlibrary hdlboard;`],
    ['after a character literal quote', `constant q : character := '"';\nlibrary hdlboard;`],
  ];
  for (const [label, source] of yes) {
    test(`D-1: detects ${label}`, () => {
      assert.equal(usesHdlboardLibrary(source), true);
    });
  }

  const no: Array<[string, string]> = [
    ['a line comment', '-- library hdlboard;'],
    ['a block comment', '/* library hdlboard; */'],
    ['a string literal', 'report "library hdlboard;";'],
    ['a longer name', 'library hdlboardx;'],
    ['use without library clause', 'use work.hdlboard_pkg.all;'],
    ['another library only', 'library ieee; use ieee.std_logic_1164.all;'],
  ];
  for (const [label, source] of no) {
    test(`D-2: ignores ${label}`, () => {
      assert.equal(usesHdlboardLibrary(source), false);
    });
  }
});
