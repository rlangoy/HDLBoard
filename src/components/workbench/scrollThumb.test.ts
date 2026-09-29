// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { isOverflowing, MIN_THUMB_PX, scrollPerThumbPixel, thumbGeometry } from './scrollThumb';

describe('thumbGeometry', () => {
  test('content that fits is not overflowing', () => {
    expect(isOverflowing({ position: 0, contentSize: 200, viewSize: 200 })).toBe(false);
  });

  test('the thumb is as long as the visible share of the content', () => {
    expect(thumbGeometry({ position: 0, contentSize: 400, viewSize: 100 })).toEqual({ offset: 0, length: 25 });
  });

  test('scrolled to the end, the thumb touches the end of the track', () => {
    const { offset, length } = thumbGeometry({ position: 300, contentSize: 400, viewSize: 100 });
    expect(offset + length).toBe(100);
  });

  test('a very long list still gets a thumb big enough to grab', () => {
    expect(thumbGeometry({ position: 0, contentSize: 100_000, viewSize: 100 }).length).toBe(MIN_THUMB_PX);
  });

  test('a track shortened by the arrow buttons keeps the thumb inside it', () => {
    const { offset, length } = thumbGeometry({ position: 300, contentSize: 400, viewSize: 200 }, 172);
    expect(offset + length).toBe(172);
  });
});

describe('scrollPerThumbPixel', () => {
  test('dragging the thumb its full travel scrolls the full range', () => {
    const metrics = { position: 0, contentSize: 400, viewSize: 100 };
    const travel = metrics.viewSize - thumbGeometry(metrics).length;
    expect(travel * scrollPerThumbPixel(metrics)).toBe(300);
  });

  test('nothing to scroll means a drag moves nothing', () => {
    expect(scrollPerThumbPixel({ position: 0, contentSize: 100, viewSize: 100 })).toBe(0);
  });
});
