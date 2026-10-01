// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOARD_INPUT_NAMES, BOARD_OUTPUT_NAMES, BOARD_PORTS } from './boardPorts.js';

test('the spelled-out inputs and outputs are the board ports, plus the legacy rst', () => {
  const spelled = [...BOARD_INPUT_NAMES, ...BOARD_OUTPUT_NAMES].map((name) => name.toLowerCase());
  assert.deepEqual(new Set([...spelled, 'rst']), new Set(BOARD_PORTS));
});
