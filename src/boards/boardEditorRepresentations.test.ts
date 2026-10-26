// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { expect, it } from 'vitest';
import { initialBoardDocument } from './boardEditorStorage';
import { changeAt, parsedDocument, valueAt } from './boardEditorModel';
import { createRepresentation, representationValue, type ConfigurableComponent, type Representation } from './boardEditorRepresentations';

const cases: [ConfigurableComponent, Representation][] = [
  ['pushbuttons', 'cross'], ['pushbuttons', 'vector'], ['pushbuttons', 'scalars'],
  ['sevenSegment', 'independent'], ['sevenSegment', 'multiplexed'],
];
it.each(cases)('converts %s to %s with valid ports while preserving other components', (component, kind) => {
  for (const board of initialBoardDocument().boards) {
    const original = valueAt(board, ['ports', component]) as Record<string, unknown>;
    const current = { ...original, customExtension: { retained: true } };
    const next = representationValue(current, component, createRepresentation(board, component, kind));
    const changed = changeAt(board, ['ports', component], next) as Record<string, unknown>;
    expect(parsedDocument({ version: 2, boards: [changed] }).warnings).toEqual([]);
    expect(next.activeLow).toBe(original.activeLow);
    expect(next.customExtension).toEqual({ retained: true });
    expect(valueAt(changed, ['ports', 'resetButton'])).toEqual(valueAt(board, ['ports', 'resetButton']));
    expect(representationValue(next, component, current)).toEqual(current);
  }
});
it('does not generate names already used by another component', () => {
  const board = changeAt(initialBoardDocument().boards[0], ['ports', 'clock'], 'BTN_centre') as Record<string, unknown>;
  const cross = createRepresentation(board, 'pushbuttons', 'cross');
  expect(valueAt(cross, ['cross', 'centre'])).toBe('BTN_centre1');
});
