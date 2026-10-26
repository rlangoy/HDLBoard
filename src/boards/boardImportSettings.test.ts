// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { builtInBoard } from './boardCatalog';
import { boardImportSettings } from './boardImportSettings';
import { parseBoardFile } from './parseBoards';
import type { BoardDefinition } from './types';

function expectRoundTrip(board: BoardDefinition) {
  const file = JSON.stringify({ version: 2, boards: [boardImportSettings(board)] });
  const parsed = parseBoardFile(file, { fileName: 'preview.json', origin: board.origin });
  expect(parsed.warnings).toEqual([]);
  expect(parsed.boards).toEqual([board]);
  expect(boardImportSettings(board)).not.toHaveProperty('origin');
}

describe('board import settings', () => {
  it.each(['default', 'de1-soc', 'de10-lite', 'basys3', 'nexys-a7'])('preserves every setting of %s through the v2 importer', (id) => {
    expectRoundTrip(builtInBoard(id));
  });

  it('preserves scalar buttons in a row and a multiplexed display without a decimal point', () => {
    const board = builtInBoard('basys3');
    expectRoundTrip({
      ...board,
      ports: {
        ...board.ports,
        pushbuttons: { group: { kind: 'scalars', ports: ['BTN0', 'BTN1'] }, layout: 'row', activeLow: true },
        sevenSegment: { kind: 'multiplexed', segments: { kind: 'vector', port: 'seg', count: 7 }, digitEnables: 'an', digits: 4, activeLow: false, digitEnablesActiveLow: false },
      },
    });
  });
});
