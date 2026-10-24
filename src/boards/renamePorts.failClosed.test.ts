// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { expect, it, vi } from 'vitest';
import { renameInSource, UNREADABLE_REASON } from './renamePorts';

vi.mock('../components/workbench/highlight', () => ({
  tokenizeSource: () => {
    throw new Error('tokenizer failure');
  },
}));

it('fails closed when the tokenizer throws: the file is a conflict, never renamed by guesswork', () => {
  expect(renameInSource('x <= KEY_N;', 'vhdl', [{ from: 'KEY_N', to: 'KEY' }])).toEqual({ ok: false, reasons: [UNREADABLE_REASON] });
});
