// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import {
  BOARD_MIN_W,
  CHROME_W,
  EDITOR_MIN_W,
  SIDEBAR_MIN_W,
  collapsesAt,
  fitSidePanes,
  parsePaneLayout,
  type PaneLayout,
} from './paneLayout';

const open = { sidebar: false, board: false };

describe('fitSidePanes', () => {
  test('gives both panes what they asked for when it fits', () => {
    expect(fitSidePanes(1600, { sidebar: 300, board: 700 }, open)).toEqual({ sidebar: 300, board: 700 });
  });

  test('never lets a pane go under its minimum', () => {
    expect(fitSidePanes(1600, { sidebar: 50, board: 50 }, open)).toEqual({
      sidebar: SIDEBAR_MIN_W,
      board: BOARD_MIN_W,
    });
  });

  test('a window resize shrinks both open panes in proportion to their slack', () => {
    const { sidebar, board } = fitSidePanes(1000, { sidebar: 408, board: 560 }, open);
    expect(sidebar + board + EDITOR_MIN_W + CHROME_W).toBeCloseTo(1000);
    // 200 px of slack above the minimum against 360.
    expect((408 - sidebar) / (560 - board)).toBeCloseTo(200 / 360);
  });

  test('during a drag the other pane gives way first', () => {
    expect(fitSidePanes(1000, { sidebar: 500, board: 600 }, open, 'board')).toEqual({
      sidebar: 500,
      board: 1000 - CHROME_W - EDITOR_MIN_W - 500,
    });
  });

  test('a collapsed sidebar leaves its room to the board', () => {
    const { board } = fitSidePanes(1000, { sidebar: 300, board: 2000 }, { sidebar: true, board: false });
    expect(board).toBe(1000 - CHROME_W - EDITOR_MIN_W);
  });

  test('a collapsed board leaves its room to the sidebar', () => {
    const { sidebar } = fitSidePanes(1000, { sidebar: 2000, board: 600 }, { sidebar: false, board: true });
    expect(sidebar).toBe(1000 - CHROME_W - EDITOR_MIN_W);
  });

  test('a collapsed pane keeps the width it will reopen at', () => {
    expect(fitSidePanes(1600, { sidebar: 320, board: 700 }, { sidebar: true, board: true })).toEqual({
      sidebar: 320,
      board: 700,
    });
  });
});

describe('collapsesAt', () => {
  test('snaps shut under half the minimum width', () => {
    expect(collapsesAt(SIDEBAR_MIN_W / 2 - 1, SIDEBAR_MIN_W)).toBe(true);
    expect(collapsesAt(-40, SIDEBAR_MIN_W)).toBe(true);
  });

  test('stays open from half the minimum up', () => {
    expect(collapsesAt(SIDEBAR_MIN_W / 2, SIDEBAR_MIN_W)).toBe(false);
    expect(collapsesAt(SIDEBAR_MIN_W - 1, SIDEBAR_MIN_W)).toBe(false);
  });
});

describe('parsePaneLayout', () => {
  const defaults: PaneLayout = {
    sidebarWidth: 278,
    boardWidth: 792,
    consoleHeight: 180,
    sidebarCollapsed: false,
    boardCollapsed: false,
  };

  test('reads back a stored layout', () => {
    const stored = { sidebarWidth: 300, boardWidth: 500, consoleHeight: 220, sidebarCollapsed: true, boardCollapsed: true };
    expect(parsePaneLayout(JSON.stringify(stored), defaults)).toEqual(stored);
  });

  test('a layout stored before panes could collapse opens with both panes open', () => {
    const stored = { sidebarWidth: 300, boardWidth: 500, consoleHeight: 220 };
    expect(parsePaneLayout(JSON.stringify(stored), defaults)).toEqual({
      ...stored,
      sidebarCollapsed: false,
      boardCollapsed: false,
    });
  });

  test('falls back to the defaults on missing or malformed data', () => {
    expect(parsePaneLayout(null, defaults)).toEqual(defaults);
    expect(parsePaneLayout('{not json', defaults)).toEqual(defaults);
    expect(parsePaneLayout(JSON.stringify({ sidebarWidth: -5, boardCollapsed: 'yes' }), defaults)).toEqual(defaults);
  });
});
