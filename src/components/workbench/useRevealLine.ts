// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useRef, type RefObject } from 'react';
import { countLines, lineHeightOrFallback, offsetOfLine } from './diagnosticLocation';

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
  readonly id: number;
  /** Move the caret and focus there (default); false only scrolls, for the pane the student did not click. */
  readonly focus?: boolean;
}

/**
 * Scrolls the textarea so `reveal.line` is in the middle and puts the caret at
 * its start. Neither the scroll nor `focus({ preventScroll })` fires
 * `pointerdown`, so the reveal never clears the markers it is showing (§ 4.5.2).
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

    const lineHeight = lineHeightOrFallback(
      getComputedStyle(textarea).lineHeight,
      textarea.scrollHeight,
      countLines(active.content),
    );
    textarea.scrollTop = Math.max(0, (reveal.line - 1) * lineHeight - textarea.clientHeight / 2);
    if (reveal.focus === false) return;
    const caret = offsetOfLine(active.content, reveal.line);
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(caret, caret);
    // `active.content` is read once, when the request arrives; later edits must not re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal?.id, active?.id]);
}
