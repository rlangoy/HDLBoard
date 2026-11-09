// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useMemo, useRef } from 'react';
import type { Overlay } from './useOverlay';

/** The Explorer pane: whether it is shut, and how to open or shut it. */
export interface ExplorerPane {
  readonly collapsed: boolean;
  show(open: boolean): void;
}

/**
 * The views that fold the Explorer away while they are shown (the waveform, the Settings
 * page, the board settings). Each holds the fold; the Explorer comes back, if it was open
 * before the first one, only once the last one lets go. Going from one such view to
 * another keeps it folded.
 */
export interface ExplorerFolds {
  hold(holder: string): void;
  release(holder: string): void;
}

/**
 * The fold, apart from React. A release is settled a moment later (a microtask), so a view
 * taking over in the same update holds the fold first, whichever order the two arrive in.
 */
export function createExplorerFolds(explorer: () => ExplorerPane): ExplorerFolds {
  const holders = new Set<string>();
  // Whether the Explorer was open before the fold; null while nothing folds it.
  let openBefore: boolean | null = null;
  const settle = () => {
    if (holders.size > 0 || openBefore === null) return;
    const reopen = openBefore;
    openBefore = null;
    if (reopen) explorer().show(true);
  };
  return {
    hold(holder) {
      openBefore ??= !explorer().collapsed;
      holders.add(holder);
      explorer().show(false);
    },
    release(holder) {
      if (holders.delete(holder)) queueMicrotask(settle);
    },
  };
}

/** One fold for the whole workbench, reading the Explorer as it is now. */
export function useExplorerFolds(explorer: ExplorerPane): ExplorerFolds {
  const latest = useRef(explorer);
  latest.current = explorer;
  return useMemo(() => createExplorerFolds(() => latest.current), []);
}

/** The pages in the editor's place that fold the Explorer away. */
const FOLDING_PAGES: ReadonlySet<Overlay> = new Set<Overlay>(['settings', 'boardSettings']);

/** Holds the fold while one of FOLDING_PAGES is shown, the page's name as the holder. */
export function usePageFold(overlay: Overlay, folds: ExplorerFolds): void {
  const previous = useRef<Overlay>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = overlay;
    if (FOLDING_PAGES.has(overlay)) folds.hold(String(overlay));
    if (before !== overlay && FOLDING_PAGES.has(before)) folds.release(String(before));
  }, [overlay, folds]);
}
