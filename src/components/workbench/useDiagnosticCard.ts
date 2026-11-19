// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type RefObject } from 'react';
import type { RevealRequest } from './useRevealLine';

/** How long the pointer rests on a marked line number before its card opens. */
const OPEN_DELAY_MS = 350;
/** How long the card waits after the pointer leaves, so it can move from the gutter into the card. */
const CLOSE_DELAY_MS = 250;
/** After a reveal's scroll has settled: its scroll event closes any card. */
const PIN_AFTER_REVEAL_MS = 120;
/** The card's gap above or below the line it describes. */
const LINE_GAP_PX = 2;
/** The card's gap right of the gutter. */
const GUTTER_GAP_PX = 4;

const GUTTER_ROW = '.wb-editor__gutter-line[data-line]';

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
}

export interface DiagnosticCardApi {
  readonly state: CardState | null;
  /** On the editor body: resting on a marked line number opens its card. */
  readonly onPointerOver: (e: PointerEvent<HTMLElement>) => void;
  readonly onPointerLeave: () => void;
  /** A click on a marked line number or its `!`: the card opens and stays. */
  readonly pin: (row: GutterRow) => void;
  readonly close: () => void;
  readonly onCardEnter: () => void;
  readonly onCardLeave: () => void;
}

/** Below the line, or above it in the lower half of the editor, right of the gutter. */
function placement(body: HTMLElement, row: HTMLElement): CSSProperties {
  const b = body.getBoundingClientRect();
  const r = row.getBoundingClientRect();
  const left = r.right - b.left + GUTTER_GAP_PX;
  const inLowerHalf = r.top - b.top > b.height / 2;
  return inLowerHalf ? { left, bottom: b.bottom - r.top + LINE_GAP_PX } : { left, top: r.bottom - b.top + LINE_GAP_PX };
}

/**
 * The problem card of a marked line (DiagnosticCard.tsx): it opens when the pointer
 * rests on the line number or its `!`, stays while the pointer is on it, and is pinned
 * by a click there. Esc, a scroll or a click in the code closes it.
 */
export function useDiagnosticCard(bodyRef: RefObject<HTMLElement>, isMarked: (line: number) => boolean): DiagnosticCardApi {
  const [state, setState] = useState<CardState | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const openTimer = useRef<number>();
  const closeTimer = useRef<number>();

  const clearTimers = useCallback(() => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const open = useCallback((row: GutterRow, pinned: boolean) => {
    clearTimers();
    const body = bodyRef.current;
    if (body) setState({ line: row.line, pinned, style: placement(body, row.element) });
  }, [bodyRef, clearTimers]);

  const close = useCallback(() => {
    clearTimers();
    setState(null);
  }, [clearTimers]);

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
      open(row, false);
      return;
    }
    window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => open(row, false), OPEN_DELAY_MS);
  }, [open]);

  const onPointerOver = useCallback((e: PointerEvent<HTMLElement>) => {
    if (e.target instanceof Element && e.target.closest('.wb-diagcard')) return;
    const row = gutterRowAt(e.target);
    if (row && isMarked(row.line)) hover(row);
    else scheduleClose();
  }, [isMarked, hover, scheduleClose]);

  useEffect(() => {
    if (!state) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state, close]);

  return {
    state,
    onPointerOver,
    onPointerLeave: scheduleClose,
    pin: (row) => open(row, true),
    close,
    onCardEnter: () => window.clearTimeout(closeTimer.current),
    onCardLeave: scheduleClose,
  };
}

/**
 * A design-check console link (*Line n*) opens the line's problem card: once the reveal
 * has scrolled the line into view, the card is pinned there, as a click on its `!` would.
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
    const timer = window.setTimeout(() => {
      const row = gutterRowOf(gutterRef.current, line);
      if (row && cardRef.current.isMarked(line)) cardRef.current.pin(row);
    }, PIN_AFTER_REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [reveal, fileId, gutterRef]);
}
