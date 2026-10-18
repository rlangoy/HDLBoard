// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The mouse on anything that shows time across its width – the canvas, and the figure in
 * report mode (docs/waveform_viewer_spec.md S9, § 8.8). Each gesture is its own hook:
 *  - `useWheelGestures`: the wheel scrolls in time, Ctrl + wheel zooms around the mouse;
 *  - `useRangeDrag`: dragging marks a time range, zoomed into on release; a click places
 *    the cursor;
 *  - `useCursorDrag`: the cursor follows the mouse from its first move;
 *  - `useCursorGrab`: the cursor jumps to the press and follows the mouse.
 * `useRoutedPointer` hands each press to the gesture for where it began. A cancelled
 * press (a lost pointer, a system gesture) ends a gesture without acting on it.
 */

import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import type { Ticks } from './model';

/** A press that moves less than this is a click, not a drag. */
const DRAG_THRESHOLD_PX = 4;
const WHEEL_ZOOM_RATE = 0.002;
const MAIN_BUTTON = 0;

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

export type TimeHandlers = WheelHandlers & DragHandlers;

/** The view's actions as the gestures call them. */
export function timeHandlersOf(actions: {
  setCursor(time: Ticks): void;
  setWindow(window: { start: Ticks; end: Ticks }): void;
  scroll(ticks: number): void;
  zoom(factor: number, at?: Ticks): void;
}): TimeHandlers {
  return {
    onCursor: actions.setCursor,
    onZoomTo: (start, end) => actions.setWindow({ start, end }),
    onScroll: actions.scroll,
    onZoom: actions.zoom,
  };
}

export interface Selection {
  readonly from: Ticks;
  readonly to: Ticks;
}

type PointerHandler = (event: PointerEvent<HTMLElement>) => void;

export interface PointerHandlers {
  readonly onPointerDown: PointerHandler;
  readonly onPointerMove: PointerHandler;
  readonly onPointerUp: PointerHandler;
  readonly onPointerCancel: PointerHandler;
}

export interface RangeGestures extends PointerHandlers {
  /** The range being marked, while a drag is under way. */
  readonly selection: Selection | undefined;
}

const localX = (event: { clientX: number }, element: Element): number => event.clientX - element.getBoundingClientRect().left;
const localY = (event: { clientY: number }, element: Element): number => event.clientY - element.getBoundingClientRect().top;
const timeAtEvent = (mapping: TimeMapping, event: PointerEvent<HTMLElement>): Ticks => mapping.timeAt(localX(event, event.currentTarget));

/** Starts a press: the element keeps the pointer until it is released. False for any button but the main one. */
function capture(event: PointerEvent<HTMLElement>): boolean {
  if (event.button !== MAIN_BUTTON) return false;
  event.currentTarget.setPointerCapture(event.pointerId);
  return true;
}

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

export function useRangeDrag(mapping: TimeMapping, handlers: DragHandlers): RangeGestures {
  const press = useRef<{ readonly x: number; dragging: boolean } | null>(null);
  const [selection, setSelection] = useState<Selection | undefined>(undefined);
  const end = () => {
    const ended = press.current;
    press.current = null;
    setSelection(undefined);
    return ended;
  };
  const onPointerDown: PointerHandler = (event) => {
    if (capture(event)) press.current = { x: localX(event, event.currentTarget), dragging: false };
  };
  const onPointerMove: PointerHandler = (event) => {
    const current = press.current;
    if (current === null) return;
    current.dragging ||= Math.abs(localX(event, event.currentTarget) - current.x) >= DRAG_THRESHOLD_PX;
    if (current.dragging) setSelection({ from: mapping.timeAt(current.x), to: timeAtEvent(mapping, event) });
  };
  const onPointerUp: PointerHandler = (event) => {
    const ended = end();
    if (ended === null) return;
    const time = timeAtEvent(mapping, event);
    if (!ended.dragging) return handlers.onCursor(time);
    const [start, stop] = [mapping.timeAt(ended.x), time].sort((a, b) => a - b);
    if (stop > start) handlers.onZoomTo(start, stop);
  };
  return { selection, onPointerDown, onPointerMove, onPointerUp, onPointerCancel: end };
}

export function useCursorDrag(mapping: TimeMapping, onCursor: (time: Ticks) => void): PointerHandlers {
  const pressed = useRef(false);
  const release = () => {
    pressed.current = false;
  };
  return {
    onPointerDown: (event) => {
      pressed.current = capture(event);
    },
    onPointerMove: (event) => {
      if (pressed.current) onCursor(timeAtEvent(mapping, event));
    },
    onPointerUp: release,
    onPointerCancel: release,
  };
}

export function useCursorGrab(mapping: TimeMapping, onCursor: (time: Ticks) => void): PointerHandlers {
  const drag = useCursorDrag(mapping, onCursor);
  return {
    ...drag,
    onPointerDown: (event) => {
      drag.onPointerDown(event);
      if (event.button === MAIN_BUTTON) onCursor(timeAtEvent(mapping, event));
    },
  };
}

/**
 * Hands each press, and the moves and release that follow it, to the route `choose`
 * names for where the press began (x and y from the element's top left).
 */
export function useRoutedPointer<K extends string>(
  routes: Readonly<Record<K, PointerHandlers>>,
  choose: (x: number, y: number) => K,
): PointerHandlers {
  const active = useRef<K | null>(null);
  const forward = (event: PointerEvent<HTMLElement>, pick: (route: PointerHandlers) => PointerHandler) => {
    if (active.current !== null) pick(routes[active.current])(event);
  };
  const finish = (pick: (route: PointerHandlers) => PointerHandler) => (event: PointerEvent<HTMLElement>) => {
    forward(event, pick);
    active.current = null;
  };
  return {
    onPointerDown: (event) => {
      active.current = choose(localX(event, event.currentTarget), localY(event, event.currentTarget));
      forward(event, (route) => route.onPointerDown);
    },
    onPointerMove: (event) => forward(event, (route) => route.onPointerMove),
    onPointerUp: finish((route) => route.onPointerUp),
    onPointerCancel: finish((route) => route.onPointerCancel),
  };
}
