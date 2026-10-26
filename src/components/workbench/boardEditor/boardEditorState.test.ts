// SPDX-License-Identifier: GPL-2.0-only
import { expect, it } from 'vitest';
import { boardEditorReducer, initialEditorState } from './boardEditorState';

const original = { id: 'lab', name: 'Lab', extension: { retain: true } };

it('discards a renamed copy by resetting every editor field to the saved board', () => {
  const copied = boardEditorReducer(initialEditorState(original), { type: 'copy', board: { ...original, id: 'copy', name: 'Copy' } });
  const renamed = boardEditorReducer(copied, { type: 'rename', name: 'Renamed', id: 'renamed' });
  expect(boardEditorReducer(renamed, { type: 'reset', board: renamed.saved })).toEqual(initialEditorState(original));
});

it('preserves the draft after a save failure', () => {
  const edited = boardEditorReducer(initialEditorState(original), { type: 'change', path: ['name'], value: 'Edited' });
  const saving = boardEditorReducer(edited, { type: 'saving' });
  expect(boardEditorReducer(saving, { type: 'failed', error: 'Could not apply' })).toEqual({ ...edited, saving: false, error: 'Could not apply' });
});

it('records the renamed ID as the next save target after success', () => {
  const renamed = { ...original, id: 'renamed', name: 'Renamed' };
  expect(boardEditorReducer(initialEditorState(original), { type: 'saved', board: renamed })).toEqual(initialEditorState(renamed));
});
