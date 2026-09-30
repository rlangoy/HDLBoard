// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import type { LineDiagnostic, LineMessage } from './diagnosticStore';
import {
  adviceText,
  CLEAR_HINT,
  describeHint,
  describeLine,
  INLINE_MESSAGE_MAX_CHARS,
  inlineText,
  summarize,
} from './diagnosticText';

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

// ---- advice (docs/editor_diagnostics_improvement_plan.md § 4.9)

const GHDL_WORDS = 'missing ";" at end of object declaration';
const HEADLINE = '`rttange` is not a VHDL keyword — did you mean `range`?';

function advised(text: string, advice: LineMessage['advice']): LineMessage {
  return { ...message(text), advice };
}

describe('advice wording', () => {
  test('the headline is the inline text', () => {
    expect(inlineText(lineOf(advised(GHDL_WORDS, { headline: HEADLINE })))).toBe(HEADLINE);
  });

  test('an underline alone keeps the compiler’s text inline', () => {
    expect(inlineText(lineOf(advised(GHDL_WORDS, { span: { start: 0, end: 1 } })))).toBe(GHDL_WORDS);
  });

  test('the tooltip: headline, a blank line, then the compiler’s own words', () => {
    const line = lineOf(advised(GHDL_WORDS, { headline: HEADLINE }));
    expect(describeLine(line)).toBe(`error: ${HEADLINE}\n\nGHDL: ${GHDL_WORDS}`);
  });

  test('the compiler’s details stay under its words', () => {
    const line = lineOf({ ...advised("'then' is expected here", { headline: 'h' }), details: ["(found: 'if')"] });
    expect(describeLine(line)).toBe("error: h\n\nGHDL: 'then' is expected here\n  (found: 'if')");
  });

  test('a line of only muted follow-ons has no inline text', () => {
    expect(inlineText(lineOf(advised('x', { headline: 'f', followOnOf: 3 })))).toBe('');
  });

  test('muted follow-ons are not counted in "(+N more)"', () => {
    const line = lineOf(advised('first', { headline: 'h' }), advised('late', { headline: 'f', followOnOf: 13 }));
    expect(inlineText(line)).toBe('h');
  });

  test('the summary reads the headline, without doubling its question mark', () => {
    const summary = summarize('blinkTest.vhdl', [lineOf(advised(GHDL_WORDS, { headline: HEADLINE }))]);
    expect(summary).toBe(`blinkTest.vhdl: 1 error. First on line 13: ${HEADLINE} ${CLEAR_HINT}`);
  });

  test('the hint tooltip names the line that points here', () => {
    const from = lineOf(advised("'then' is expected here", { headline: 'Probably a missing `then` at the end of line 12.' }));
    expect(describeHint(from)).toBe('Line 13: Probably a missing `then` at the end of line 12.');
  });

  test.each([
    ['endif', 'end if', '`endif` (line 46) must be two words in VHDL: `end if`.'],
    ['elseif', 'elsif', '`elseif` (line 46) is written `elsif` in VHDL.'],
  ])('joined keyword %s', (word, wanted, text) => {
    expect(adviceText.joinedKeyword(word, 46, wanted)).toBe(text);
  });
});

describe('advice wording, several messages', () => {
  test('a blank line separates the messages of a line with advice', () => {
    const line = lineOf(advised('first', { headline: 'h' }), advised('late', { headline: 'f', followOnOf: 13 }));
    expect(describeLine(line)).toBe('error: h\n\nGHDL: first\n\nerror: f\n\nGHDL: late');
  });
});
