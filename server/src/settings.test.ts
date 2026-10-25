// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { MAX_SESSIONS, MAX_WAVE_BYTES, WAVE_CHECK_MS, WS_PORT, readIntSetting, readVhdlWaveFormat } from './settings.js';

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

  test('uses the default, with a warning, for a value that is not a whole number: never "no limit"', (t) => {
    const warn = t.mock.method(console, 'warn', () => {});
    for (const raw of ['', 'many', '3.5', '-1']) assert.equal(readIntSetting(MAX_SESSIONS, { HDL_MAX_SESSIONS: raw }), 32, raw);
    assert.equal(warn.mock.callCount(), 4);
  });
});

describe('waveform settings', () => {
  test('defaults: 16 MiB, checked every 250 ms, GHW for VHDL', () => {
    assert.equal(readIntSetting(MAX_WAVE_BYTES, {}), 16 * 1024 * 1024);
    assert.equal(readIntSetting(WAVE_CHECK_MS, {}), 250);
    assert.equal(readVhdlWaveFormat({}), 'ghw');
  });

  test('can be changed', () => {
    assert.equal(readIntSetting(MAX_WAVE_BYTES, { HDL_MAX_WAVE_BYTES: '1000' }), 1000);
    assert.equal(readVhdlWaveFormat({ HDL_WAVE_VHDL_FORMAT: 'VCD' }), 'vcd');
    assert.equal(readVhdlWaveFormat({ HDL_WAVE_VHDL_FORMAT: 'fst' }), 'ghw');
  });
});
