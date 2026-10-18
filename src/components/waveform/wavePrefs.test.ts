// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCursorShown, loadReportColouring } from './wavePrefs';

/** A browser whose storage holds `text` for every key. */
function storing(text: string | null): void {
  vi.stubGlobal('window', { localStorage: { getItem: () => text, setItem: () => undefined } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('stored report colouring', () => {
  it.each(['null', '42', '"text"', 'not json', '[]', '{"colouring":"rainbow"}'])('is black and white when %j is stored', (text) => {
    storing(text);
    expect(loadReportColouring()).toBe('mono');
  });

  it('is colour when colour was picked', () => {
    storing('{"colouring":"colour"}');
    expect(loadReportColouring()).toBe('colour');
  });
});

describe('stored cursor', () => {
  it('is shown when nothing is stored', () => {
    storing(null);
    expect(loadCursorShown()).toBe(true);
  });

  it('is hidden once switched off', () => {
    storing('off');
    expect(loadCursorShown()).toBe(false);
  });
});
