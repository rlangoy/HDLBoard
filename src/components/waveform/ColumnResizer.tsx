// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The divider between the signal list and the traces: drag it, or use ← / → on it, to
 * make the Signal and Value columns wider or narrower. The width is remembered in this
 * browser.
 */

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

const STORAGE_KEY = 'hdlboard.waveform.namesWidth';
export const DEFAULT_NAMES_WIDTH = 260;
const MIN_WIDTH = 150;
const MAX_WIDTH = 640;
const KEY_STEP_PX = 16;

const clampWidth = (width: number): number => Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)));

function storedWidth(): number {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return stored > 0 ? clampWidth(stored) : DEFAULT_NAMES_WIDTH;
  } catch {
    return DEFAULT_NAMES_WIDTH;
  }
}

function storeWidth(width: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(width));
  } catch {
    // Not remembered in a private window; the width still applies now.
  }
}

/** The list's width, and a setter that keeps it in range and remembers it. */
export function useNamesWidth(): [number, (width: number) => void] {
  const [width, setWidth] = useState(storedWidth);
  const set = (next: number) => {
    const clamped = clampWidth(next);
    setWidth(clamped);
    storeWidth(clamped);
  };
  return [width, set];
}

/** Dragging the divider: the width follows the mouse from where the press began. */
function useDrag(width: number, onWidth: (width: number) => void) {
  // Where the drag started: a ref, so a move right after the press already sees it.
  const drag = useRef<{ readonly x: number; readonly width: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, width };
    setDragging(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current !== null) onWidth(drag.current.width + event.clientX - drag.current.x);
  };
  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };
  return { dragging, onPointerDown, onPointerMove, endDrag };
}

export function ColumnResizer({ width, onWidth }: { readonly width: number; readonly onWidth: (width: number) => void }) {
  const { dragging, onPointerDown, onPointerMove, endDrag } = useDrag(width, onWidth);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -KEY_STEP_PX, ArrowRight: KEY_STEP_PX }[event.key];
    if (step === undefined) return;
    // The pane's own arrow keys move the cursor; here they size the columns.
    event.preventDefault();
    event.stopPropagation();
    onWidth(width + step);
  };
  return (
    <div
      className={dragging ? 'wv-resizer is-dragging' : 'wv-resizer'}
      role="separator"
      aria-orientation="vertical"
      aria-label="Width of the signal list"
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={MAX_WIDTH}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to make the Signal and Value columns wider or narrower"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => onWidth(DEFAULT_NAMES_WIDTH)}
      onKeyDown={onKeyDown}
    />
  );
}
