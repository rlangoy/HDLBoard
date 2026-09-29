// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { isOverflowing, MIN_THUMB_PX, scrollPerThumbPixel, thumbGeometry } from './scrollThumb';

describe('thumbGeometry', () => {
  test('content that fits is not overflowing', () => {
    expect(isOverflowing({ scrollTop: 0, scrollHeight: 200, clientHeight: 200 })).toBe(false);
  });

  test('the thumb is as tall as the visible share of the content', () => {
    expect(thumbGeometry({ scrollTop: 0, scrollHeight: 400, clientHeight: 100 })).toEqual({ top: 0, height: 25 });
  });

  test('scrolled to the end, the thumb touches the bottom of the rail', () => {
    const { top, height } = thumbGeometry({ scrollTop: 300, scrollHeight: 400, clientHeight: 100 });
    expect(top + height).toBe(100);
  });

  test('a very long list still gets a thumb big enough to grab', () => {
    expect(thumbGeometry({ scrollTop: 0, scrollHeight: 100_000, clientHeight: 100 }).height).toBe(MIN_THUMB_PX);
  });
});

describe('scrollPerThumbPixel', () => {
  test('dragging the thumb its full travel scrolls the full range', () => {
    const metrics = { scrollTop: 0, scrollHeight: 400, clientHeight: 100 };
    const travel = metrics.clientHeight - thumbGeometry(metrics).height;
    expect(travel * scrollPerThumbPixel(metrics)).toBe(300);
  });

  test('nothing to scroll means a drag moves nothing', () => {
    expect(scrollPerThumbPixel({ scrollTop: 0, scrollHeight: 100, clientHeight: 100 })).toBe(0);
  });
});
