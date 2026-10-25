// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { tabEdit, type IndentEdit } from './tabIndent';

/** The text after the edit, with the selection marked as [ ]. */
function after(text: string, edit: IndentEdit | undefined): string {
  if (edit === undefined) return text;
  const result = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  return `${result.slice(0, edit.selectStart)}[${result.slice(edit.selectStart, edit.selectEnd)}]${result.slice(edit.selectEnd)}`;
}

describe('tabEdit', () => {
  it('inserts a tab at the caret, or in place of a selection within one line', () => {
    expect(after('ab', tabEdit('ab', 1, 1, false))).toBe('a\t[]b');
    expect(after('abcd', tabEdit('abcd', 1, 3, false))).toBe('a\t[]d');
  });

  it('indents every line of a selection over several lines, and keeps them selected', () => {
    const text = 'one\ntwo\nthree';
    expect(after(text, tabEdit(text, 1, 6, false))).toBe('[\tone\n\ttwo]\nthree');
  });

  it('does not indent the line after a selection that ends with its newline', () => {
    const text = 'one\ntwo\n';
    expect(after(text, tabEdit(text, 0, 4, false))).toBe('[\tone]\ntwo\n');
  });

  it('takes one tab or up to four spaces off each selected line with Shift+Tab', () => {
    const text = '\tone\n      two\nthree';
    expect(after(text, tabEdit(text, 0, text.length, true))).toBe('[one\n  two\nthree]');
  });

  it("outdents the caret's line and moves the caret with it", () => {
    const text = 'x\n\t\tsig;';
    expect(after(text, tabEdit(text, 5, 5, true))).toBe('x\n\ts[]ig;');
  });

  it('does nothing on Shift+Tab when there is no indentation to take off', () => {
    expect(tabEdit('abc', 1, 1, true)).toBeUndefined();
  });
});
