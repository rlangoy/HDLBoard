// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useRef, type RefObject } from 'react';
import { countLines, offsetOfLine, scrollToShow, visualColumn } from './diagnosticLocation';
import { measureText } from './symbols/textMetrics';

let revealSeq = 0;

/** A fresh `RevealRequest.id`, shared by every source of reveals so the newest always wins. */
export function nextRevealId(): number {
  revealSeq += 1;
  return revealSeq;
}

/** Ask the editor to show a line: `id` changes on every request, so the same line can be revealed twice. */
export interface RevealRequest {
  readonly fileId: string;
  readonly line: number;
  /** The character on the line to show (0-based): an error's word, which may be far to the right on a long line. */
  readonly index?: number;
  readonly id: number;
  /** Move the caret and focus there (default); false only scrolls, for the pane the student did not click. */
  readonly focus?: boolean;
  /** The id of a symbol to highlight there until the next click (Go to declaration). */
  readonly highlight?: string;
}

/** How much code stays visible left of a revealed word, in characters. */
const LEFT_CONTEXT_CHARS = 8;
/** Lines kept in view above and below the caret's line when it is scrolled to. */
const CARET_CONTEXT_LINES = 2;

/** Scrolls sideways just enough to show character `index` of `line`; a word already in view does not move. */
function revealIndex(textarea: HTMLTextAreaElement, line: string, index: number): void {
  const { paddingLeft, charWidth, tabSize } = measureText(textarea);
  const x = paddingLeft + visualColumn(line, index, tabSize) * charWidth;
  const view = { scroll: textarea.scrollLeft, size: textarea.clientWidth };
  textarea.scrollLeft = scrollToShow(x, view, LEFT_CONTEXT_CHARS * charWidth);
}

/** Scrolls just enough to show the caret, with a little code around it. */
export function showCaret(textarea: HTMLTextAreaElement): void {
  const { value, selectionStart } = textarea;
  const line = countLines(value.slice(0, selectionStart));
  const { paddingTop, lineHeight } = measureText(textarea);
  const view = { scroll: textarea.scrollTop, size: textarea.clientHeight };
  textarea.scrollTop = scrollToShow(paddingTop + (line - 1) * lineHeight, view, CARET_CONTEXT_LINES * lineHeight);
  revealIndex(textarea, lineText(value, line), selectionStart - offsetOfLine(value, line));
}

function lineText(content: string, line: number): string {
  return content.split('\n')[line - 1] ?? '';
}

/**
 * Scrolls the textarea so `reveal.line` is in the middle, and sideways so its
 * `index` shows, and puts the caret there (at the line's start without one).
 * Neither the scroll nor `focus({ preventScroll })` fires `pointerdown`, so the
 * reveal never clears the markers it is showing (§ 4.5.2).
 */
export function useRevealLine(
  textareaRef: RefObject<HTMLTextAreaElement>,
  active: { readonly id: string; readonly content: string } | null,
  reveal: RevealRequest | null | undefined,
): void {
  const handledId = useRef<number | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!reveal || !active || !textarea) return;
    if (reveal.fileId !== active.id || handledId.current === reveal.id) return;
    handledId.current = reveal.id;

    const { lineHeight } = measureText(textarea);
    textarea.scrollTop = Math.max(0, (reveal.line - 1) * lineHeight - textarea.clientHeight / 2);
    if (reveal.index !== undefined) revealIndex(textarea, lineText(active.content, reveal.line), reveal.index);
    if (reveal.focus === false) return;
    const caret = offsetOfLine(active.content, reveal.line) + (reveal.index ?? 0);
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(caret, caret);
    // `active.content` is read once, when the request arrives; later edits must not re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal?.id, active?.id]);
}
