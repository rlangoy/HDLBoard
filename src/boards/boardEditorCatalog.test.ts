// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { afterEach, expect, it, vi } from 'vitest';
import { combineDocument, loadEditorCatalog } from './boardEditorCatalog';
import { initialBoardDocument } from './boardEditorStorage';

afterEach(() => vi.unstubAllGlobals());
const storage = (text: string | null = null) => vi.stubGlobal('window', { localStorage: { getItem: () => text } });

it('keeps local editor saves separate from the live Board I/O catalog', async () => {
  const saved = initialBoardDocument();
  saved.boards[0].name = 'Edited name';
  storage(JSON.stringify(saved));
  vi.stubGlobal('fetch', async () => ({ ok: false, status: 404 }));
  const loaded = await loadEditorCatalog();
  expect(loaded.file.boards[0].name).toBe('Edited name');
  expect(loaded.runtimeFile).toEqual(initialBoardDocument());
});

it('loads hosted v2 boards with optional and extension fields untouched', async () => {
  storage();
  const user = { ...initialBoardDocument().boards[1], id: 'lab', name: 'Lab', extra: { teacher: true } };
  vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ version: 2, boards: [user], metadata: 'keep' }) }));
  const loaded = await loadEditorCatalog();
  expect(loaded.file.boards[loaded.file.boards.length - 1]).toEqual(user);
  expect(loaded.file.metadata).toBe('keep');
});
it('keeps v1 boards for the runtime without migrating the editable document', async () => {
  storage();
  const user = { id: 'legacy', name: 'Legacy', ports: { clock50: 'CLK', switches: 'SW', pushbuttons: 'KEY_N', leds: 'LEDR', sevenSegment: ['HEX0_N', 'HEX1_N', 'HEX2_N', 'HEX3_N', 'HEX4_N', 'HEX5_N'] } };
  vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ version: 1, boards: [user] }) }));
  const loaded = await loadEditorCatalog();
  expect(loaded.legacy.map((board) => board.id)).toContain('legacy');
  expect(loaded.file.boards.some((board) => board.id === 'legacy')).toBe(false);
});
it('keeps saved edits when the hosted file cannot be fetched', async () => {
  const file = initialBoardDocument();
  file.boards[0].description = 'Saved locally';
  storage(JSON.stringify(file));
  vi.stubGlobal('fetch', async () => { throw new Error('Offline'); });
  const loaded = await loadEditorCatalog();
  expect(loaded.file.boards[0].description).toBe('Saved locally');
  expect(loaded.warnings).toContain('Offline');
});
it('appends newly installed boards without replacing saved boards or document metadata', () => {
  const saved = { ...initialBoardDocument(), metadata: { retained: true } };
  const next = { ...initialBoardDocument().boards[0], id: 'new-lab', name: 'New lab' };
  const combined = combineDocument(saved, { version: 2, boards: [next] });
  expect(combined.boards.slice(0, saved.boards.length)).toEqual(saved.boards);
  expect(combined.boards[combined.boards.length - 1]).toEqual(next);
  expect(combined.metadata).toEqual(saved.metadata);
});
