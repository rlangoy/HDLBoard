// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The mouse on the waveform canvas (docs/waveform_viewer_spec.md S9):
 *  - a click places the cursor; dragging on the time ruler, the cursor's handle or the
 *    cursor line itself moves it;
 *  - dragging across the traces marks a time range, which is zoomed into on release;
 *  - the wheel scrolls in time, Ctrl + wheel zooms around the mouse.
 * The wheel listener is a native one: React's are passive, and Ctrl + wheel must not
 * zoom the whole page.
 */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { Ticks } from './model';
import { nearCursor } from './cursorHandle';
import { xToTime, type TimeView } from './timeAxis';
import { AXIS_HEIGHT } from './waveDraw';

/** A press that moves less than this is a click, not a drag. */
const DRAG_THRESHOLD_PX = 4;
const WHEEL_ZOOM_RATE = 0.002;

export interface GestureHandlers {
  onCursor(time: Ticks): void;
  /** A press on a shown row's trace selects that signal, for the arrow keys. */
  onSelectRow(path: string): void;
  onZoomTo(start: Ticks, end: Ticks): void;
  onScroll(ticks: number): void;
  onZoom(factor: number, at: Ticks): void;
}

export interface Selection {
  readonly from: Ticks;
  readonly to: Ticks;
}

interface Press {
  readonly x: number;
  /** On the ruler or the cursor line: the press moves the cursor instead of marking a range. */
  readonly movesCursor: boolean;
  dragging: boolean;
}

/** Where the view is and where its cursor stands. */
export interface CanvasView {
  readonly view: TimeView;
  readonly cursor: Ticks;
}

/** Whether a press at (`x`, `y`) takes the cursor: on the ruler, or on or beside its line. */
export function takesCursor({ view, cursor }: CanvasView, x: number, y: number): boolean {
  return y < AXIS_HEIGHT || nearCursor(view, cursor, x);
}

const localX = (event: { clientX: number; currentTarget: Element }) => event.clientX - event.currentTarget.getBoundingClientRect().left;
const localY = (event: { clientY: number; currentTarget: Element }) => event.clientY - event.currentTarget.getBoundingClientRect().top;

function useWheel(canvasRef: RefObject<HTMLCanvasElement>, view: TimeView, handlers: GestureHandlers): void {
  const latest = useRef({ view, handlers });
  latest.current = { view, handlers };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return undefined;
    const onWheel = (event: WheelEvent) => {
      const { view: now, handlers: on } = latest.current;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        on.onZoom(Math.exp(event.deltaY * WHEEL_ZOOM_RATE), xToTime(now, event.clientX - canvas.getBoundingClientRect().left));
      } else {
        on.onScroll((Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * now.ticksPerPx);
      }
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [canvasRef]);
}

export interface PointerGestures {
  readonly selection: Selection | undefined;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  readonly onPointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  readonly onPointerUp: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
}

function usePointer({ view, cursor }: CanvasView, handlers: GestureHandlers): PointerGestures {
  const press = useRef<Press | null>(null);
  const [selection, setSelection] = useState<Selection | undefined>(undefined);
  const timeAt = (event: ReactPointerEvent<HTMLCanvasElement>) => xToTime(view, localX(event));

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const onRuler = localY(event) < AXIS_HEIGHT;
    press.current = { x: localX(event), movesCursor: takesCursor({ view, cursor }, localX(event), localY(event)), dragging: false };
    // A press on the line itself leaves the cursor where it is until the mouse moves.
    if (onRuler) handlers.onCursor(timeAt(event));
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = press.current;
    if (current === null) return;
    if (current.movesCursor) return handlers.onCursor(timeAt(event));
    current.dragging ||= Math.abs(localX(event) - current.x) >= DRAG_THRESHOLD_PX;
    if (current.dragging) setSelection({ from: xToTime(view, current.x), to: timeAt(event) });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = press.current;
    press.current = null;
    setSelection(undefined);
    if (current === null || current.movesCursor) return;
    if (!current.dragging) return handlers.onCursor(timeAt(event));
    const [start, end] = [xToTime(view, current.x), timeAt(event)].sort((a, b) => a - b);
    handlers.onZoomTo(start, end);
  };

  return { selection, onPointerDown, onPointerMove, onPointerUp };
}

export function useCanvasGestures(canvasRef: RefObject<HTMLCanvasElement>, at: CanvasView, handlers: GestureHandlers): PointerGestures {
  useWheel(canvasRef, at.view, handlers);
  return usePointer(at, handlers);
}
