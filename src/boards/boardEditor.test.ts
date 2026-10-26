// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { afterEach, expect, it, vi } from 'vitest';
import { builtInBoard } from './boardCatalog';
import { boardImportSettings } from './boardImportSettings';
import { changeAt, parsedDocument, readDocument, replaceBoard, valueAt } from './boardEditorModel';
import { initialBoardDocument, loadBoardEdits } from './boardEditorStorage';
import { validateBoardDraft } from './boardEditorValidation';

afterEach(() => vi.unstubAllGlobals());
const board = (id: string) => initialBoardDocument().boards.find((item) => item.id === id) as Record<string, unknown>;
const validate = (raw: Record<string, unknown>) => validateBoardDraft(raw, boardImportSettings(builtInBoard(String(raw.id))), []);

it('round trips without filling optional defaults or changing array order', () => {
  const original = initialBoardDocument();
  expect(readDocument(JSON.stringify(replaceBoard(original, original.boards[0])))).toEqual(original);
  expect(original.boards[0].labels).toBeUndefined();
});
it('updates one board and preserves extensions and other boards', () => {
  const file = { ...initialBoardDocument(), extension: { retained: true } };
  const raw = { ...file.boards[4], custom: { untouched: 3 } };
  const draft = changeAt(raw, ['ports', 'pushbuttons', 'cross', 'up'], 'NEW_UP') as Record<string, unknown>;
  const saved = replaceBoard(file, draft);
  expect(saved.boards.slice(0, 4)).toEqual(file.boards.slice(0, 4));
  expect(saved.boards[4].custom).toEqual({ untouched: 3 });
  expect(saved.extension).toEqual(file.extension);
  expect(parsedDocument(saved).warnings).toEqual([]);
});
it('reports case-insensitive duplicate cross names on both fields', () => {
  const raw = changeAt(board('nexys-a7'), ['ports', 'pushbuttons', 'cross', 'up'], 'btnc') as Record<string, unknown>;
  const errors = validate(raw);
  expect(errors['ports.pushbuttons.cross.up']).toBeTruthy();
  expect(errors['ports.pushbuttons.cross.centre']).toBeTruthy();
});
it('uses existing HDL naming rules and supported numeric limits', () => {
  const raw = changeAt(board('de1-soc'), ['ports', 'switches', 'count'], 19) as Record<string, unknown>;
  expect(validate(raw)['ports.switches.count']).toBeTruthy();
  const reserved = changeAt(board('de1-soc'), ['ports', 'pushbuttons', 'port'], 'entity') as Record<string, unknown>;
  expect(validate(reserved)['ports.pushbuttons.port']).toContain('reserved word');
});
it('changes pushbutton polarity without touching reset polarity', () => {
  const raw = changeAt(board('nexys-a7'), ['ports', 'pushbuttons', 'activeLow'], true);
  expect(valueAt(raw, ['ports', 'resetButton', 'activeLow'])).toBe(true);
  expect(valueAt(raw, ['ports', 'sevenSegment', 'segments'])).toEqual(['CA', 'CB', 'CC', 'CD', 'CE', 'CF', 'CG']);
});
it('preserves vector segments and independent port ordering', () => {
  expect(validate(board('basys3'))).toEqual({});
  const raw = changeAt(board('de1-soc'), ['ports', 'sevenSegment', 'ports', 1], 'DISPLAY_ONE') as Record<string, unknown>;
  expect(valueAt(raw, ['ports', 'sevenSegment', 'ports', 0])).toBe('HEX0');
  expect(validate(raw)).toEqual({});
});
it('retains optional fields when untouched and removes a cleared decimal point only', () => {
  const raw = changeAt(board('nexys-a7'), ['ports', 'sevenSegment', 'decimalPoint'], undefined) as Record<string, unknown>;
  expect(valueAt(raw, ['ports', 'sevenSegment', 'decimalPoint'])).toBeUndefined();
  expect(validate(raw)).toEqual({});
});
it('does not validate a removed optional port using its old saved value', () => {
  const raw = changeAt(board('nexys-a7'), ['ports', 'sevenSegment', 'decimalPoint'], undefined);
  const changed = changeAt(raw, ['ports', 'resetButton', 'port'], 'DP') as Record<string, unknown>;
  expect(validate(changed)).toEqual({});
});
it('reports duplicate and unsafe resource links beside their fields', () => {
  const raw = { ...board('de1-soc'), resources: [{ label: 'Manual', url: 'javascript:alert(1)' }, { label: 'Manual', url: 'https://example.com' }] };
  const errors = validate(raw);
  expect(errors['resources.0.url']).toBeTruthy();
  expect(errors['resources.0.label']).toBeTruthy();
  expect(errors['resources.1.label']).toBeTruthy();
});
it('reads legacy local editor settings without writing to storage', () => {
  const file = initialBoardDocument();
  vi.stubGlobal('window', { localStorage: { getItem: () => JSON.stringify(file) } });
  expect(loadBoardEdits()).toEqual(file);
});
