// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type RefObject } from 'react';
import type { RevealRequest } from './useRevealLine';

/** How long the pointer rests on a marked line number before its card opens. */
const OPEN_DELAY_MS = 350;
/** How long the card waits after the pointer leaves, so it can move from the gutter into the card. */
const CLOSE_DELAY_MS = 250;
/** The card's gap above or below the line it describes. */
const LINE_GAP_PX = 2;
/** The card's gap right of the gutter. */
const GUTTER_GAP_PX = 4;

const GUTTER_ROW = '.wb-editor__gutter-line[data-line]';
const WAITING_FOR_SCROLL: CSSProperties = { visibility: 'hidden' };

/** A line number in the gutter, as the DOM has it. */
export interface GutterRow {
  readonly element: HTMLElement;
  readonly line: number;
}

/** The gutter row a pointer event is on, if any. */
export function gutterRowAt(target: EventTarget): GutterRow | undefined {
  const element = target instanceof Element ? target.closest<HTMLElement>(GUTTER_ROW) : null;
  return element ? { element, line: Number(element.dataset.line) } : undefined;
}

function gutterRowOf(gutter: HTMLElement | null, line: number): GutterRow | undefined {
  const element = gutter?.querySelector<HTMLElement>(`.wb-editor__gutter-line[data-line="${line}"]`);
  return element ? { element, line } : undefined;
}

export interface CardState {
  readonly line: number;
  readonly pinned: boolean;
  readonly style: CSSProperties;
  /** Opened from the keyboard: the card takes the focus, and gives it back when it closes. */
  readonly focused: boolean;
}

export interface DiagnosticCardApi {
  readonly state: CardState | null;
  /** On the editor body: resting on a marked line number opens its card. */
  readonly onPointerOver: (e: PointerEvent<HTMLElement>) => void;
  readonly onPointerLeave: () => void;
  /** A click on a marked line number or its `!`: the card opens and stays. */
  readonly pin: (row: GutterRow) => void;
  /** The keyboard (Alt+Enter) on a line: its card opens, stays, and takes the focus. */
  readonly openAt: (line: number) => boolean;
  /** The code scrolled: a pinned card follows its line while it is in view; any other closes. */
  readonly reposition: () => void;
  readonly close: () => void;
  readonly onCardEnter: () => void;
  readonly onCardLeave: () => void;
}

/** Below the line, or above it in the lower half of the editor, right of the gutter; none when the line is out of view. */
function placement(body: HTMLElement, row: HTMLElement): CSSProperties | undefined {
  const b = body.getBoundingClientRect();
  const r = row.getBoundingClientRect();
  if (r.bottom <= b.top || r.top >= b.bottom) return undefined;
  const left = r.right - b.left + GUTTER_GAP_PX;
  const inLowerHalf = r.top - b.top > b.height / 2;
  return inLowerHalf ? { left, bottom: b.bottom - r.top + LINE_GAP_PX } : { left, top: r.bottom - b.top + LINE_GAP_PX };
}

interface CardElements {
  readonly body: RefObject<HTMLElement>;
  readonly gutter: RefObject<HTMLElement>;
  /** Where the focus goes back when a card opened from the keyboard closes: the code. */
  readonly returnFocus: () => void;
}

/**
 * The problem card of a marked line (DiagnosticCard.tsx): it opens when the pointer
 * rests on the line number or its `!`, stays while the pointer is on it, and is pinned
 * by a click there or by Alt+Enter on the line. Esc or a click in the code closes it; a
 * scroll moves a pinned card with its line.
 */
export function useDiagnosticCard(elements: CardElements, isMarked: (line: number) => boolean): DiagnosticCardApi {
  const [state, setState] = useState<CardState | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const openTimer = useRef<number>();
  const closeTimer = useRef<number>();
  const { body: bodyRef, gutter: gutterRef, returnFocus } = elements;

  const clearTimers = useCallback(() => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const open = useCallback((row: GutterRow, how: { pinned: boolean; focused: boolean }) => {
    clearTimers();
    const style = bodyRef.current ? placement(bodyRef.current, row.element) : undefined;
    // A pinned card whose line is still scrolling into view waits hidden for the scroll to place it.
    if (style || how.pinned) setState({ line: row.line, style: style ?? WAITING_FOR_SCROLL, ...how });
  }, [bodyRef, clearTimers]);

  const close = useCallback(() => {
    clearTimers();
    if (stateRef.current?.focused) returnFocus();
    setState(null);
  }, [clearTimers, returnFocus]);

  const scheduleClose = useCallback(() => {
    window.clearTimeout(openTimer.current);
    if (stateRef.current?.pinned) return;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setState((s) => (s?.pinned ? s : null)), CLOSE_DELAY_MS);
  }, []);

  const hover = useCallback((row: GutterRow) => {
    const current = stateRef.current;
    if (current?.line === row.line) {
      window.clearTimeout(closeTimer.current);
      return;
    }
    if (current?.pinned) return;
    // Moving from one marked line to the next while a card shows: follow at once.
    if (current) {
      open(row, { pinned: false, focused: false });
      return;
    }
    window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => open(row, { pinned: false, focused: false }), OPEN_DELAY_MS);
  }, [open]);

  const onPointerOver = useCallback((e: PointerEvent<HTMLElement>) => {
    if (e.target instanceof Element && e.target.closest('.wb-diagcard')) return;
    const row = gutterRowAt(e.target);
    if (row && isMarked(row.line)) hover(row);
    else scheduleClose();
  }, [isMarked, hover, scheduleClose]);

  const reposition = useCallback(() => {
    const current = stateRef.current;
    if (!current) return;
    const row = current.pinned ? gutterRowOf(gutterRef.current, current.line) : undefined;
    const style = row && bodyRef.current ? placement(bodyRef.current, row.element) : undefined;
    if (style) setState({ ...current, style });
    else close();
  }, [bodyRef, gutterRef, close]);

  const openAt = useCallback((line: number) => {
    const row = gutterRowOf(gutterRef.current, line);
    if (!row || !isMarked(line)) return false;
    open(row, { pinned: true, focused: true });
    return true;
  }, [gutterRef, isMarked, open]);

  // Esc closes the card, and only the card: caught before the editor's own Esc (Find bar, Tab escape).
  useEffect(() => {
    if (!state) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      close();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [state, close]);

  // The line's warning went (fixed, or the file's lines changed): its card goes too.
  const shownLine = state?.line;
  useEffect(() => {
    if (shownLine !== undefined && !isMarked(shownLine)) close();
  }, [shownLine, isMarked, close]);

  return {
    state,
    onPointerOver,
    onPointerLeave: scheduleClose,
    pin: (row) => open(row, { pinned: true, focused: false }),
    openAt,
    reposition,
    close,
    onCardEnter: () => window.clearTimeout(closeTimer.current),
    onCardLeave: scheduleClose,
  };
}

/**
 * A design-check console link (*Line n*) opens the line's problem card: the reveal has
 * just set the scroll, so the card is pinned on the next frame, and follows its line
 * when the scroll event comes.
 */
export function usePinCardOnReveal(
  reveal: RevealRequest | null | undefined,
  fileId: string,
  gutterRef: RefObject<HTMLElement>,
  card: { readonly isMarked: (line: number) => boolean; readonly pin: (row: GutterRow) => void },
): void {
  const cardRef = useRef(card);
  cardRef.current = card;
  const handledId = useRef<number | null>(null);
  useEffect(() => {
    if (!reveal?.openCard || reveal.fileId !== fileId || handledId.current === reveal.id) return undefined;
    handledId.current = reveal.id;
    const { line } = reveal;
    const frame = window.requestAnimationFrame(() => {
      const row = gutterRowOf(gutterRef.current, line);
      if (row && cardRef.current.isMarked(line)) cardRef.current.pin(row);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [reveal, fileId, gutterRef]);
}
