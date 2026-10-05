// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import {
  DEFAULT_SPLIT_PREFS, canSplit, fractionBounds, fractionForKey, parseEditorSplitPrefs, SPLIT_PANE_MIN_W,
} from './editorSplit';

/** docs/impl_split_screen.md § 4.8, § 4.9, § 6.4. */

test('canSplit at 404 / 405 px', () => {
  expect(canSplit(404)).toBe(false);
  expect(canSplit(405)).toBe(true);
});

test('fractionBounds keep each pane at its minimum', () => {
  const b = fractionBounds(1005);
  expect(b.min * 1000).toBeCloseTo(SPLIT_PANE_MIN_W);
  expect((1 - b.max) * 1000).toBeCloseTo(SPLIT_PANE_MIN_W);
  expect(fractionBounds(300)).toEqual({ min: 0.5, max: 0.5 });
});

describe('fractionForKey', () => {
  const bounds = { min: 0.2, max: 0.8 };
  test.each([
    ['ArrowLeft', false, 0.48],
    ['ArrowRight', false, 0.52],
    ['ArrowLeft', true, 0.4],
    ['ArrowRight', true, 0.6],
    ['Home', false, 0.2],
    ['End', false, 0.8],
  ])('%s (shift %s)', (key, shift, expected) => {
    expect(fractionForKey(key, shift, 0.5, bounds)).toBeCloseTo(expected as number);
  });

  test('clamps to the bounds', () => {
    expect(fractionForKey('ArrowLeft', true, 0.25, bounds)).toBe(0.2);
  });

  test('Enter collapses; other keys are not ours', () => {
    expect(fractionForKey('Enter', false, 0.5, bounds)).toBe('collapse');
    expect(fractionForKey('a', false, 0.5, bounds)).toBeUndefined();
  });
});

describe('parseEditorSplitPrefs', () => {
  test.each([null, '', 'not json', '42', '{"tbFraction": 2, "preference": "sometimes"}'])('%s falls back to the defaults', (json) => {
    expect(parseEditorSplitPrefs(json, DEFAULT_SPLIT_PREFS)).toEqual(DEFAULT_SPLIT_PREFS);
  });

  test('reads stored values', () => {
    expect(parseEditorSplitPrefs('{"tbFraction":0.3,"preference":"never"}', DEFAULT_SPLIT_PREFS)).toEqual({ tbFraction: 0.3, preference: 'never' });
  });
});
