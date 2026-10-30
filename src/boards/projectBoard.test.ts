// SPDX-License-Identifier: GPL-2.0-only
import { describe, expect, it } from 'vitest';

import { catalogWithProjectBoard as catalogFor } from './projectBoard';
import { BUILT_IN_BOARDS as BUILT_INS } from './boardCatalog';

describe('catalogWithProjectBoard with a mismatched config', () => {
  it('keeps a built-in selected board', () => {
    const installed = { boards: [...BUILT_INS], warnings: [] } as never;
    const result = catalogFor(installed, { version: 2, id: 'other', name: 'Other' }, 'de1-soc');
    expect(result.boards.some((board) => board.id === 'de1-soc')).toBe(true);
  });
});
