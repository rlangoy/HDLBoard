// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { isEditorEscape } from './useDiagnosticCard';

/** An element as the key handler sees it: its tag, whether it is in the editor, and whether it is in a card. */
const element = (tagName: string, { inCard = false } = {}) => ({ tagName, closest: () => (inCard ? {} : null) }) as unknown as EventTarget;

describe('Esc while a problem card is open', () => {
  const textarea = element('TEXTAREA');
  const body = { contains: (n: Node | null) => (n as unknown) === textarea };

  test.each([
    ['from the code', textarea],
    ['from the card, Copy focused', element('BUTTON', { inCard: true })],
    ['with nothing focused', element('BODY')],
  ])('%s closes the card', (_label, target) => {
    expect(isEditorEscape(target, body)).toBe(true);
  });

  test.each([
    ['from a dialog', element('BUTTON')],
    ['from the console', element('INPUT')],
  ])('%s is left to that control', (_label, target) => {
    expect(isEditorEscape(target, body)).toBe(false);
  });
});
