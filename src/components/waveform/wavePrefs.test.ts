// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_REPORT_OPTIONS } from './figure/figureStyle';
import { loadReportOptions } from './wavePrefs';

/** A browser whose storage holds `text` for every key. */
function storing(text: string | null): void {
  vi.stubGlobal('window', { localStorage: { getItem: () => text, setItem: () => undefined } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('stored report options', () => {
  it.each(['null', '42', '"text"', 'not json', '[]'])('fall back to the defaults when %j is stored', (text) => {
    storing(text);
    expect(loadReportOptions()).toEqual(DEFAULT_REPORT_OPTIONS);
  });

  it('keep the colour and the cursor', () => {
    storing('{"colouring":"colour","showCursor":true}');
    expect(loadReportOptions()).toEqual({ ...DEFAULT_REPORT_OPTIONS, colouring: 'colour', showCursor: true });
  });

  it('always open at two columns, whatever width was stored', () => {
    storing('{"width":"column"}');
    expect(loadReportOptions().width).toBe('page');
  });
});
