// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { MAX_SESSIONS, WS_PORT, readIntSetting } from './settings.js';

describe('readIntSetting', () => {
  test('reads the HDL_* name', () => {
    assert.equal(readIntSetting(WS_PORT, { HDL_WS_PORT: '9090' }), 9090);
  });

  test('falls back to the legacy GHDL_* name', () => {
    assert.equal(readIntSetting(MAX_SESSIONS, { GHDL_MAX_SESSIONS: '12' }), 12);
  });

  test('prefers the HDL_* name when both are set', () => {
    assert.equal(readIntSetting(WS_PORT, { HDL_WS_PORT: '9090', GHDL_WS_PORT: '9191' }), 9090);
  });

  test('uses the default when neither is set', () => {
    assert.equal(readIntSetting(WS_PORT, {}), 9010);
    assert.equal(readIntSetting(MAX_SESSIONS, {}), 32);
  });
});
