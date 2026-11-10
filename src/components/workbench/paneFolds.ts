// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useMemo, useRef } from 'react';
import type { Overlay } from './useOverlay';

/** A side pane (the Explorer, Board I/O): whether it is shut, and how to open or shut it. */
export interface FoldablePane {
  readonly collapsed: boolean;
  show(open: boolean): void;
}

/**
 * The views that fold a side pane away while they are shown (the waveform, the Settings
 * page, the board settings, the Projects page). Each holds the fold; the pane comes back,
 * if it was open before the first one, only once the last one lets go. Going from one such
 * view to another keeps it folded.
 */
export interface PaneFolds {
  hold(holder: string): void;
  release(holder: string): void;
}

/**
 * The fold, apart from React. A release is settled a moment later (a microtask), so a view
 * taking over in the same update holds the fold first, whichever order the two arrive in.
 */
export function createPaneFolds(pane: () => FoldablePane): PaneFolds {
  const holders = new Set<string>();
  // Whether the pane was open before the fold; null while nothing folds it.
  let openBefore: boolean | null = null;
  const settle = () => {
    if (holders.size > 0 || openBefore === null) return;
    const reopen = openBefore;
    openBefore = null;
    if (reopen) pane().show(true);
  };
  return {
    hold(holder) {
      openBefore ??= !pane().collapsed;
      holders.add(holder);
      pane().show(false);
    },
    release(holder) {
      if (holders.delete(holder)) queueMicrotask(settle);
    },
  };
}

/** One fold for a side pane of the workbench, reading the pane as it is now. */
export function usePaneFolds(pane: FoldablePane): PaneFolds {
  const latest = useRef(pane);
  latest.current = pane;
  return useMemo(() => createPaneFolds(() => latest.current), []);
}

/** The pages in the editor's place that fold the Explorer away. */
export const EXPLORER_FOLDING_PAGES: ReadonlySet<Overlay> = new Set<Overlay>(['settings', 'boardSettings', 'projects']);

/** The pages in the editor's place that fold Board I/O away: the Projects page has no use for the board. */
export const BOARD_FOLDING_PAGES: ReadonlySet<Overlay> = new Set<Overlay>(['projects']);

/** Holds the fold while one of `pages` is shown, the page's name as the holder. */
export function usePageFold(overlay: Overlay, folds: PaneFolds, pages: ReadonlySet<Overlay>): void {
  const previous = useRef<Overlay>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = overlay;
    if (pages.has(overlay)) folds.hold(String(overlay));
    if (before !== overlay && pages.has(before)) folds.release(String(before));
  }, [overlay, folds, pages]);
}
