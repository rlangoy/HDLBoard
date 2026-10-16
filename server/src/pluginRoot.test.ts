// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { isAbsolute, resolve } from 'node:path';
import { describe, test } from 'node:test';
import { PLUGIN_DIR_ENV, resolvePluginRoot } from './pluginRoot.js';

const BESIDE = resolve('/srv/HDLBoard/server/plugins/vhdl');
const PACKAGED = resolve('/app/resources/plugins/vhdl');
const FROM_ENV = resolve('/opt/plugins');

describe('resolvePluginRoot', () => {
  test('the environment wins over everything', () => {
    assert.equal(resolvePluginRoot({ [PLUGIN_DIR_ENV]: FROM_ENV }, PACKAGED, BESIDE), FROM_ENV);
  });

  test('the directory the packaged app passes comes next', () => {
    assert.equal(resolvePluginRoot({}, PACKAGED, BESIDE), PACKAGED);
  });

  test('otherwise the plugins beside the server are used', () => {
    assert.equal(resolvePluginRoot({}, undefined, BESIDE), BESIDE);
  });

  test('an empty setting counts as absent', () => {
    assert.equal(resolvePluginRoot({ [PLUGIN_DIR_ENV]: '' }, '', BESIDE), BESIDE);
  });

  test('a relative setting becomes absolute', () => {
    assert.ok(isAbsolute(resolvePluginRoot({ [PLUGIN_DIR_ENV]: 'plugins' })));
  });

  test('by default it is server/plugins/vhdl', () => {
    assert.match(resolvePluginRoot({}).replace(/\\/g, '/'), /\/server\/plugins\/vhdl\/?$/);
  });
});
