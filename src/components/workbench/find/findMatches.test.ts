// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { cleanQuery, findMatches, keepUnchangedLines, lineOfOffset, matchesByLine, replaceAllText, stillMatches } from './findMatches';

const starts = (text: string, query: string) => findMatches(text, query).matches.map((m) => m.start);

describe('findMatches', () => {
  it('finds nothing for an empty query', () => {
    expect(findMatches('ledr', '')).toEqual({ matches: [], capped: false });
  });

  it('ignores case, both ways (S2)', () => {
    expect(starts('LEDR ledr LedR', 'ledr')).toEqual([0, 5, 10]);
    expect(starts('LEDR ledr LedR', 'LEDR')).toEqual([0, 5, 10]);
  });

  it('never overlaps', () => {
    expect(starts('aaaa', 'aa')).toEqual([0, 2]);
  });

  it('never crosses a line break', () => {
    expect(starts('ab\ncd', 'b\nc')).toEqual([]);
    expect(starts('ab\ncd', 'bc')).toEqual([]);
  });

  it('keeps offsets into the original text when lowercasing changes its length (D3)', () => {
    const text = 'İ -- x <= ledr;';
    expect('İ'.toLowerCase().length).toBe(2);
    const [match] = findMatches(text, 'LEDR').matches;
    expect(text.slice(match.start, match.end)).toBe('ledr');
  });

  it('finds an emoji in a text that takes the slow path, with the whole emoji in the match', () => {
    const text = 'İ -- 🚀 done';
    const [match] = findMatches(text, '🚀 DONE').matches;
    expect(match).toBeDefined();
    expect(text.slice(match.start, match.end)).toBe('🚀 done');
  });

  it('stops at the cap and says so (D15)', () => {
    const result = findMatches('a'.repeat(10), 'a', 4);
    expect(result.matches).toHaveLength(4);
    expect(result.capped).toBe(true);
    expect(findMatches('aaaa', 'a', 4).capped).toBe(false);
  });
});

describe('stillMatches', () => {
  it('checks the text at a match, ignoring case', () => {
    expect(stillMatches('x LEDR y', { start: 2, end: 6 }, 'ledr')).toBe(true);
    expect(stillMatches('x LED_ y', { start: 2, end: 6 }, 'ledr')).toBe(false);
  });
});

describe('matchesByLine', () => {
  it('groups matches by line, relative to the line start, across empty lines', () => {
    const text = 'clk\n\nclk clk\nx';
    const byLine = matchesByLine(text, findMatches(text, 'clk').matches);
    expect([...byLine.entries()]).toEqual([
      [0, [{ start: 0, end: 3 }]],
      [2, [{ start: 0, end: 3 }, { start: 4, end: 7 }]],
    ]);
  });
});

describe('lineOfOffset', () => {
  it('counts the line breaks before an offset', () => {
    expect(lineOfOffset('a\nb\nc', 0)).toBe(0);
    expect(lineOfOffset('a\nb\nc', 2)).toBe(1);
    expect(lineOfOffset('a\nb\nc', 4)).toBe(2);
  });
});

describe('replaceAllText', () => {
  const text = 'ledr x LEDR';
  const matches = findMatches(text, 'ledr').matches;

  it('replaces with longer, shorter and empty text, and reports where the last replacement ends', () => {
    expect(replaceAllText(text, matches, 'LED_R')).toEqual({ text: 'LED_R x LED_R', caret: 13 });
    expect(replaceAllText(text, matches, 'q')).toEqual({ text: 'q x q', caret: 5 });
    expect(replaceAllText(text, matches, '')).toEqual({ text: ' x ', caret: 3 });
  });
});

describe('cleanQuery', () => {
  it('turns line breaks into spaces', () => {
    expect(cleanQuery('a\r\nb\nc')).toBe('a b c');
  });
});

describe('keepUnchangedLines', () => {
  it('keeps the earlier array of a line whose ranges did not change, and takes the new one otherwise', () => {
    const same = [{ start: 0, end: 3 }];
    const previous = new Map([[0, same], [1, [{ start: 2, end: 5 }]]]);
    const next = new Map([[0, [{ start: 0, end: 3 }]], [1, [{ start: 4, end: 7 }]], [2, [{ start: 0, end: 1 }]]]);
    const kept = keepUnchangedLines(previous, next);
    expect(kept.get(0)).toBe(same);
    expect(kept.get(1)).toBe(next.get(1));
    expect(kept.get(2)).toBe(next.get(2));
    expect([...kept.keys()]).toEqual([0, 1, 2]);
  });
});
