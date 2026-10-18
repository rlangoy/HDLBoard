// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The mouse on the waveform canvas (docs/waveform_viewer_spec.md S9), made of the
 * gestures in `useTimeGestures.ts`: a press on the time ruler grabs the cursor, a press
 * on or beside the cursor line drags it from the first move, and a press anywhere else
 * marks a range to zoom into, or places the cursor with a click.
 */

import type { RefObject } from 'react';
import { nearCursor } from './cursorHandle';
import type { Ticks } from './model';
import { xToTime, type TimeView } from './timeAxis';
import {
  useCursorDrag,
  useCursorGrab,
  useRangeDrag,
  useRoutedPointer,
  useWheelGestures,
  type RangeGestures,
  type TimeHandlers,
} from './useTimeGestures';
import { AXIS_HEIGHT } from './waveDraw';

export interface GestureHandlers extends TimeHandlers {
  /** A press on a shown row's trace selects that signal, for the arrow keys. */
  onSelectRow(path: string): void;
}

/** Where the view is and where its cursor stands, while it is shown. */
export interface CanvasView {
  readonly view: TimeView;
  readonly cursor: Ticks | undefined;
}

export type CanvasRoute = 'ruler' | 'cursorLine' | 'traces';

/** Whether a press at (`x`, `y`) takes the shown cursor: on the ruler, or on or beside its line. */
export function takesCursor({ view, cursor }: CanvasView, x: number, y: number): boolean {
  return cursor !== undefined && (y < AXIS_HEIGHT || nearCursor(view, cursor, x));
}

/** Which gesture a press at (`x`, `y`) starts; with the cursor hidden, every press is on the traces. */
export function canvasRoute(at: CanvasView, x: number, y: number): CanvasRoute {
  if (!takesCursor(at, x, y)) return 'traces';
  return y < AXIS_HEIGHT ? 'ruler' : 'cursorLine';
}

export function useCanvasGestures(canvasRef: RefObject<HTMLCanvasElement>, at: CanvasView, handlers: GestureHandlers): RangeGestures {
  const mapping = { timeAt: (x: number) => xToTime(at.view, x), ticksPerPx: at.view.ticksPerPx };
  useWheelGestures(canvasRef, mapping, handlers);
  const traces = useRangeDrag(mapping, handlers);
  const routes = { ruler: useCursorGrab(mapping, handlers.onCursor), cursorLine: useCursorDrag(mapping, handlers.onCursor), traces };
  const pointer = useRoutedPointer(routes, (x, y) => canvasRoute(at, x, y));
  return { selection: traces.selection, ...pointer };
}
