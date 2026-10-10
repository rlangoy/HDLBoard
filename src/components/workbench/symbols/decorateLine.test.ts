// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { markRanges, tokenizeVhdlLine } from '../vhdlHighlight';
import { decorateLine } from './decorateLine';

const LINE = 'q <= cnt + cnt;';
const TOKENS = tokenizeVhdlLine(LINE);

describe('decorateLine', () => {
  it('is markRanges when nothing is hovered', () => {
    const ranges = [{ start: 5, end: 8 }];
    expect(decorateLine(TOKENS, ranges, [])).toEqual(markRanges(TOKENS, ranges));
  });

  it('labels exactly the occurrence characters and keeps the line intact', () => {
    const pieces = decorateLine(TOKENS, [], [
      { line: 0, start: 5, end: 8, kind: 'reference' },
      { line: 0, start: 11, end: 14, kind: 'declaration' },
    ]);
    expect(pieces.map((p) => p.text).join('')).toBe(LINE);
    expect(pieces.filter((p) => p.occurrence).map((p) => [p.text, p.occurrence])).toEqual([
      ['cnt', 'reference'],
      ['cnt', 'declaration'],
    ]);
  });

  it('keeps a diagnostic underline on an occurrence', () => {
    const pieces = decorateLine(TOKENS, [{ start: 5, end: 8 }], [{ line: 0, start: 5, end: 8, kind: 'reference' }]);
    const cnt = pieces.find((p) => p.text === 'cnt');
    expect(cnt).toMatchObject({ marked: true, occurrence: 'reference' });
  });

  it('is markRanges with no search matches either (docs/impl_search.md § 6.5)', () => {
    expect(decorateLine(TOKENS, [], [], [])).toEqual(markRanges(TOKENS, []));
  });

  it('labels search matches and the current one, keeping the line intact', () => {
    const pieces = decorateLine(TOKENS, [], [], [{ start: 5, end: 8 }, { start: 11, end: 14 }], { start: 11, end: 14 });
    expect(pieces.map((p) => p.text).join('')).toBe(LINE);
    expect(pieces.filter((p) => p.find).map((p) => [p.text, p.find])).toEqual([
      ['cnt', 'match'],
      ['cnt', 'current'],
    ]);
  });

  it('cuts a search match inside a token', () => {
    const pieces = decorateLine(TOKENS, [], [], [{ start: 6, end: 7 }]);
    expect(pieces.filter((p) => p.find).map((p) => p.text)).toEqual(['n']);
  });

  it('labels a search match that is also an occurrence with both (D16)', () => {
    const pieces = decorateLine(TOKENS, [], [{ line: 0, start: 5, end: 8, kind: 'reference' }], [{ start: 5, end: 8 }]);
    expect(pieces.find((p) => p.text === 'cnt')).toMatchObject({ occurrence: 'reference', find: 'match' });
  });
});
