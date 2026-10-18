// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The mouse on anything that shows time across its width – the canvas, and the figure in
 * report mode (docs/waveform_viewer_spec.md S9, § 8.8):
 *  - the wheel scrolls in time, Ctrl + wheel zooms around the mouse;
 *  - dragging marks a time range, which is zoomed into on release;
 *  - a click places the cursor;
 *  - a press where the user says the cursor is taken moves the cursor instead.
 * The wheel listener is a native one: React's are passive, and Ctrl + wheel must not
 * zoom the whole page.
 */

import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import type { Ticks } from './model';

/** A press that moves less than this is a click, not a drag. */
const DRAG_THRESHOLD_PX = 4;
const WHEEL_ZOOM_RATE = 0.002;

/** Pixels across the element ↔ time. */
export interface TimeMapping {
  /** The time at `x` pixels from the element's left edge. */
  timeAt(x: number): Ticks;
  /** How much time one pixel is. */
  readonly ticksPerPx: number;
}

export interface WheelHandlers {
  onScroll(ticks: number): void;
  onZoom(factor: number, at: Ticks): void;
}

export interface DragHandlers {
  onCursor(time: Ticks): void;
  onZoomTo(start: Ticks, end: Ticks): void;
}

/**
 * What a press does: mark a range, or take the cursor – moving it with the mouse from the
 * first move (`cursor`), or at once (`cursor-now`).
 */
export type PressKind = 'range' | 'cursor' | 'cursor-now';

export interface Selection {
  readonly from: Ticks;
  readonly to: Ticks;
}

export interface PointerGestures {
  readonly selection: Selection | undefined;
  readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: PointerEvent<HTMLElement>) => void;
}

interface Press {
  readonly x: number;
  readonly kind: PressKind;
  dragging: boolean;
}

const localX = (event: { clientX: number }, element: Element): number => event.clientX - element.getBoundingClientRect().left;
const localY = (event: { clientY: number }, element: Element): number => event.clientY - element.getBoundingClientRect().top;

export function useWheelGestures(ref: RefObject<HTMLElement>, mapping: TimeMapping, handlers: WheelHandlers): void {
  const latest = useRef({ mapping, handlers });
  latest.current = { mapping, handlers };
  useEffect(() => {
    const element = ref.current;
    if (element === null) return undefined;
    const onWheel = (event: WheelEvent) => {
      const { mapping: now, handlers: on } = latest.current;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        on.onZoom(Math.exp(event.deltaY * WHEEL_ZOOM_RATE), now.timeAt(localX(event, element)));
      } else {
        on.onScroll((Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * now.ticksPerPx);
      }
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [ref]);
}

const marksRange = (kind: PressKind): boolean => kind === 'range';

/** The press's end: a click places the cursor, a drag zooms into the range it marked. */
function release(press: Press, time: Ticks, context: { readonly mapping: TimeMapping; readonly handlers: DragHandlers }): void {
  if (!marksRange(press.kind)) return;
  if (!press.dragging) return context.handlers.onCursor(time);
  const [start, end] = [context.mapping.timeAt(press.x), time].sort((a, b) => a - b);
  if (end > start) context.handlers.onZoomTo(start, end);
}

export function useDragGestures(mapping: TimeMapping, handlers: DragHandlers, pressKind: (x: number, y: number) => PressKind): PointerGestures {
  const press = useRef<Press | null>(null);
  const [selection, setSelection] = useState<Selection | undefined>(undefined);
  const timeAt = (event: PointerEvent<HTMLElement>) => mapping.timeAt(localX(event, event.currentTarget));

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const x = localX(event, event.currentTarget);
    const kind = pressKind(x, localY(event, event.currentTarget));
    press.current = { x, kind, dragging: false };
    if (kind === 'cursor-now') handlers.onCursor(timeAt(event));
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const current = press.current;
    if (current === null) return;
    if (!marksRange(current.kind)) return handlers.onCursor(timeAt(event));
    current.dragging ||= Math.abs(localX(event, event.currentTarget) - current.x) >= DRAG_THRESHOLD_PX;
    if (current.dragging) setSelection({ from: mapping.timeAt(current.x), to: timeAt(event) });
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const current = press.current;
    press.current = null;
    setSelection(undefined);
    if (current !== null) release(current, timeAt(event), { mapping, handlers });
  };

  return { selection, onPointerDown, onPointerMove, onPointerUp };
}
