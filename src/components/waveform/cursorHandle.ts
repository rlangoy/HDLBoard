// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The cursor's handle (docs/images/mock_cursor_top.png): a label with the cursor's time
 * on the ruler, in the cursor's colour, with a point down onto the cursor line. The
 * handle and a strip either side of the line pick the cursor up, so it is easy to grab
 * and drag. Drawing and hit testing; pure apart from the context it is handed.
 */

import type { Ticks } from './model';
import { formatCursorFs, pixelResolutionFs, timeToX, type TimeView } from './timeAxis';
import { AXIS_HEIGHT, type Painter } from './waveDraw';

/** How far from the cursor line, in pixels, a press still takes the cursor. */
export const CURSOR_GRAB_PX = 6;
const FONT = '600 12px system-ui, sans-serif';
const LABEL_TOP = 2;
const LABEL_HEIGHT = 18;
const LABEL_PAD_X = 7;
const LABEL_RADIUS = 6;
const POINT_HALF_WIDTH = 5;

/** Whether a press at canvas `x` lands on the cursor line or close to it. */
export function nearCursor(view: TimeView, cursor: Ticks, x: number): boolean {
  return Math.abs(timeToX(view, cursor) - x) <= CURSOR_GRAB_PX;
}

export interface HandleScene {
  readonly view: TimeView;
  readonly cursor: Ticks;
  readonly tickFs: number;
  readonly width: number;
}

/** The label on the ruler, kept inside the canvas, with its point at the cursor line. */
export function paintCursorHandle({ ctx, colors }: Painter, scene: HandleScene): void {
  const x = timeToX(scene.view, scene.cursor);
  if (x < 0 || x > scene.width) return;
  const text = formatCursorFs(scene.cursor * scene.tickFs, pixelResolutionFs(scene.view, scene.tickFs, window.devicePixelRatio));
  ctx.font = FONT;
  const width = ctx.measureText(text).width + 2 * LABEL_PAD_X;
  const left = Math.min(Math.max(x - width / 2, 0), scene.width - width);
  const bottom = LABEL_TOP + LABEL_HEIGHT;
  ctx.fillStyle = colors.cursor;
  ctx.beginPath();
  ctx.roundRect(left, LABEL_TOP, width, LABEL_HEIGHT, LABEL_RADIUS);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - POINT_HALF_WIDTH, bottom - 1);
  ctx.lineTo(x + POINT_HALF_WIDTH, bottom - 1);
  ctx.lineTo(x, AXIS_HEIGHT);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = colors.cursorText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + width / 2, LABEL_TOP + LABEL_HEIGHT / 2);
  ctx.textAlign = 'start';
}
