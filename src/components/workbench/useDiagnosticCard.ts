// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type RefObject } from 'react';

/** How long the pointer rests on a marked line number before its card opens. */
const OPEN_DELAY_MS = 350;
/** How long the card waits after the pointer leaves, so it can move from the gutter into the card. */
const CLOSE_DELAY_MS = 250;
/** The card's gap from the line it describes. */
const GAP_PX = 2;

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
  readonly pin: (line: number, row: HTMLElement) => void;
  readonly close: () => void;
  readonly onCardEnter: () => void;
  readonly onCardLeave: () => void;
}

/** The gutter row a pointer event is on, with its line number. */
function gutterRowAt(target: EventTarget): { row: HTMLElement; line: number } | undefined {
  const row = target instanceof Element ? target.closest<HTMLElement>('.wb-editor__gutter-line[data-line]') : null;
  return row ? { row, line: Number(row.dataset.line) } : undefined;
}

/** Below the line, or above it in the lower half of the editor, right of the gutter. */
function placement(body: HTMLElement, row: HTMLElement): CSSProperties {
  const b = body.getBoundingClientRect();
  const r = row.getBoundingClientRect();
  const left = r.right - b.left + 4;
  const lowerHalf = r.top - b.top > b.height / 2;
  return lowerHalf ? { left, bottom: b.bottom - r.top + GAP_PX } : { left, top: r.bottom - b.top + GAP_PX };
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

  const open = useCallback((line: number, row: HTMLElement, pinned: boolean) => {
    clearTimers();
    const body = bodyRef.current;
    if (body) setState({ line, pinned, style: placement(body, row) });
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

  const onPointerOver = useCallback((e: PointerEvent<HTMLElement>) => {
    if (e.target instanceof Element && e.target.closest('.wb-diagcard')) return;
    const hit = gutterRowAt(e.target);
    if (!hit || !isMarked(hit.line)) {
      scheduleClose();
      return;
    }
    const current = stateRef.current;
    if (current?.line === hit.line) {
      window.clearTimeout(closeTimer.current);
      return;
    }
    if (current?.pinned) return;
    // Moving from one marked line to the next while a card shows: follow at once.
    if (current) {
      open(hit.line, hit.row, false);
      return;
    }
    window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => open(hit.line, hit.row, false), OPEN_DELAY_MS);
  }, [isMarked, open, scheduleClose]);

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
    pin: (line, row) => open(line, row, true),
    close,
    onCardEnter: () => window.clearTimeout(closeTimer.current),
    onCardLeave: scheduleClose,
  };
}
