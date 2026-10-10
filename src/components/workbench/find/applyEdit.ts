// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** Which way an edit went in: native (undoable) or the fallback (not undoable). */
export type EditPath = 'native' | 'fallback';

export interface EditOptions {
  /** Keep the view where it was (Replace All, D7); otherwise the browser scrolls to the caret. */
  readonly keepView?: boolean;
  /** Where the caret goes afterwards; default: the end of the inserted text. */
  readonly caret?: number;
}

/**
 * Replaces `start`..`end` of a textarea with `text` as one native edit
 * (docs/impl_search.md D6–D6b). `document.execCommand('insertText')` is the
 * only browser API that keeps the native undo stack on a React-controlled
 * textarea; it is deprecated, so this is its only caller (D6a). If it is ever
 * refused, `setRangeText` and a synthetic `input` event still reach React's
 * `onChange` (S5), without undo (S4's exception).
 *
 * `insertText` only edits the focused element, so the textarea is focused for
 * the edit and focus is given back afterwards: the Find field keeps it (S6).
 */
export function applyEdit(textarea: HTMLTextAreaElement, start: number, end: number, text: string, options: EditOptions = {}): EditPath {
  const previous = document.activeElement as HTMLElement | null;
  const { scrollTop, scrollLeft } = textarea;
  textarea.focus({ preventScroll: true });
  textarea.setSelectionRange(start, end);
  let path: EditPath = 'native';
  if (!document.execCommand('insertText', false, text)) {
    path = 'fallback';
    textarea.setRangeText(text, start, end, 'end');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const caret = options.caret ?? start + text.length;
  textarea.setSelectionRange(caret, caret);
  if (options.keepView) {
    textarea.scrollTop = scrollTop;
    textarea.scrollLeft = scrollLeft;
  }
  textarea.dataset.lastEdit = path;
  if (previous && previous !== textarea && previous.isConnected) previous.focus({ preventScroll: true });
  return path;
}
