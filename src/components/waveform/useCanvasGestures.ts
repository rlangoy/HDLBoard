// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The mouse on the waveform canvas (docs/waveform_viewer_spec.md S9): the gestures of
 * `useTimeGestures.ts`, where a press on the time ruler, the cursor's handle or the
 * cursor line itself takes the cursor – on the ruler at once, on the line from the
 * first move.
 */

import type { RefObject } from 'react';
import { nearCursor } from './cursorHandle';
import type { Ticks } from './model';
import { xToTime, type TimeView } from './timeAxis';
import { useDragGestures, useWheelGestures, type DragHandlers, type PointerGestures, type PressKind, type WheelHandlers } from './useTimeGestures';
import { AXIS_HEIGHT } from './waveDraw';

export type { PointerGestures, Selection } from './useTimeGestures';

export interface GestureHandlers extends WheelHandlers, DragHandlers {
  /** A press on a shown row's trace selects that signal, for the arrow keys. */
  onSelectRow(path: string): void;
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

function canvasPressKind(at: CanvasView, x: number, y: number): PressKind {
  if (y < AXIS_HEIGHT) return 'cursor-now';
  return takesCursor(at, x, y) ? 'cursor' : 'range';
}

export function useCanvasGestures(canvasRef: RefObject<HTMLCanvasElement>, at: CanvasView, handlers: GestureHandlers): PointerGestures {
  const mapping = { timeAt: (x: number) => xToTime(at.view, x), ticksPerPx: at.view.ticksPerPx };
  useWheelGestures(canvasRef, mapping, handlers);
  return useDragGestures(mapping, handlers, (x, y) => canvasPressKind(at, x, y));
}
