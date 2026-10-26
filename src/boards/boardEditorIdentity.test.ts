// SPDX-License-Identifier: GPL-2.0-only
import { expect, it } from 'vitest';
import { boardIdFromName, editableCopy } from './boardEditorIdentity';
import { MAX_ID_LENGTH, MAX_NAME_LENGTH, parseBoardFile } from './parseBoards';
import { initialBoardDocument } from './boardEditorStorage';

it('trims hyphens introduced at the ID length boundary', () => {
  expect(boardIdFromName(`${'a'.repeat(MAX_ID_LENGTH - 1)} b`, [])).toBe('a'.repeat(MAX_ID_LENGTH - 1));
});

it('keeps colliding IDs valid when adding the suffix truncates at a hyphen', () => {
  const name = `${'a'.repeat(MAX_ID_LENGTH - 3)}-ab`;
  expect(boardIdFromName(name, [{ id: name }])).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
});

it('keeps copy names within the board name limit across repeated copies', () => {
  const board = { ...initialBoardDocument().boards[0], name: 'A'.repeat(MAX_NAME_LENGTH) };
  const first = editableCopy(board, []);
  const second = editableCopy(board, [first]);
  expect(parseBoardFile(JSON.stringify({ version: 2, boards: [first, second] }), { fileName: 'Copies', origin: 'user' }).warnings).toEqual([]);
});
