// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Where ScrollArea's overlay thumb sits and how a drag of it maps back to a scroll
 * position. Pure — no DOM — so the arithmetic is tested on its own (scrollThumb.test.ts).
 */

/** The three numbers a scrolling element reports, in CSS pixels. */
export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export interface ThumbGeometry {
  /** Offset of the thumb from the top of the rail. */
  top: number;
  height: number;
}

/** Below this the thumb gets too small to hit with the pointer. */
export const MIN_THUMB_PX = 24;

/** Whether there is anything to scroll at all; no rail is drawn otherwise. */
export function isOverflowing({ scrollHeight, clientHeight }: ScrollMetrics): boolean {
  return scrollHeight > clientHeight + 1; // 1px: sub-pixel rounding is not overflow
}

/** The thumb's size shows how much of the content is visible; its offset, how far down the view is. */
export function thumbGeometry(metrics: ScrollMetrics): ThumbGeometry {
  const { scrollTop, scrollHeight, clientHeight } = metrics;
  if (!isOverflowing(metrics)) return { top: 0, height: clientHeight };
  const height = Math.min(clientHeight, Math.max(MIN_THUMB_PX, (clientHeight * clientHeight) / scrollHeight));
  const scrollRange = scrollHeight - clientHeight;
  const travel = clientHeight - height;
  const fraction = Math.min(Math.max(scrollTop / scrollRange, 0), 1);
  return { top: fraction * travel, height };
}

/** How many content pixels one pixel of thumb drag moves. */
export function scrollPerThumbPixel(metrics: ScrollMetrics): number {
  const { height } = thumbGeometry(metrics);
  const travel = metrics.clientHeight - height;
  return travel > 0 ? (metrics.scrollHeight - metrics.clientHeight) / travel : 0;
}
