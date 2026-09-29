// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Where an overlay scrollbar's thumb sits and how a drag of it maps back to a scroll
 * position, for either axis. Pure — no DOM — so the arithmetic is tested on its own
 * (scrollThumb.test.ts).
 */

/** One axis of a scrolling element, in CSS pixels: `scrollTop`/`scrollHeight`/`clientHeight` or their x twins. */
export interface ScrollMetrics {
  position: number;
  contentSize: number;
  viewSize: number;
}

export interface ThumbGeometry {
  /** Offset of the thumb from the start of the track. */
  offset: number;
  length: number;
}

/** Below this the thumb gets too small to hit with the pointer. */
export const MIN_THUMB_PX = 24;

/** Whether there is anything to scroll at all; no scrollbar is drawn otherwise. */
export function isOverflowing({ contentSize, viewSize }: ScrollMetrics): boolean {
  return contentSize > viewSize + 1; // 1px: sub-pixel rounding is not overflow
}

/**
 * The thumb's length shows how much of the content is visible; its offset, how far
 * along the view is. `trackLength` is the room the thumb moves in — the view's own
 * length unless something (the arrow buttons) takes part of it.
 */
export function thumbGeometry(metrics: ScrollMetrics, trackLength: number = metrics.viewSize): ThumbGeometry {
  const { position, contentSize, viewSize } = metrics;
  if (!isOverflowing(metrics)) return { offset: 0, length: trackLength };
  const length = Math.min(trackLength, Math.max(MIN_THUMB_PX, (trackLength * viewSize) / contentSize));
  const fraction = Math.min(Math.max(position / (contentSize - viewSize), 0), 1);
  return { offset: fraction * (trackLength - length), length };
}

/** How many content pixels one pixel of thumb drag moves. */
export function scrollPerThumbPixel(metrics: ScrollMetrics, trackLength: number = metrics.viewSize): number {
  const travel = trackLength - thumbGeometry(metrics, trackLength).length;
  return travel > 0 ? (metrics.contentSize - metrics.viewSize) / travel : 0;
}
