// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import type { LineDiagnostic, LineMessage } from './diagnosticStore';
import { CLEAR_HINT, describeLine, INLINE_MESSAGE_MAX_CHARS, inlineText, summarize } from './diagnosticText';

function message(text: string, severity: LineMessage['severity'] = 'error', details: string[] = []): LineMessage {
  return { severity, message: text, details };
}

function lineOf(...messages: LineMessage[]): LineDiagnostic {
  return { line: 13, severity: messages.some((m) => m.severity === 'error') ? 'error' : 'warning', messages };
}

describe('inlineText', () => {
  test('S-11: three messages show the first and how many more', () => {
    expect(inlineText(lineOf(message('a'), message('b'), message('c')))).toBe('a (+2 more)');
  });

  test('S-12: a 200-character message is cut to 120 characters ending in …', () => {
    const shown = inlineText(lineOf(message('x'.repeat(200))));
    expect([shown.length, shown.endsWith('…')]).toEqual([INLINE_MESSAGE_MAX_CHARS, true]);
  });

  test('S-22: an error that arrived after a warning is shown first', () => {
    expect(inlineText(lineOf(message('warn', 'warning'), message('err', 'error')))).toBe('err (+1 more)');
  });
});

describe('describeLine', () => {
  test('S-13: a detail follows its message, indented', () => {
    expect(describeLine(lineOf(message('bad', 'error', ['see here'])))).toBe('error: bad\n  see here');
  });

  test('S-23: errors first, each group in arrival order', () => {
    const line = lineOf(message('w', 'warning'), message('e1'), message('e2'));
    expect(describeLine(line)).toBe('error: e1\nerror: e2\nwarning: w');
  });
});

describe('summarize', () => {
  test('S-14: nothing marked gives an empty string', () => {
    expect(summarize('a.v', [])).toBe('');
  });

  test('S-15: one error is singular', () => {
    expect(summarize('a.v', [lineOf(message('bad'))])).toContain('1 error.');
  });

  test('S-24: ends with the clear hint', () => {
    expect(summarize('a.v', [lineOf(message('bad'))]).endsWith(CLEAR_HINT)).toBe(true);
  });

  test('names the file, the totals and the first line', () => {
    const lines = [lineOf(message('bad'), message('w', 'warning'))];
    expect(summarize('a.v', lines)).toBe(`a.v: 1 error, 1 warning. First on line 13: bad. ${CLEAR_HINT}`);
  });
});
