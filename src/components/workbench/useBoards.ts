// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useState } from 'react';
import { BUILT_IN_BOARDS, BUILT_IN_CATALOG, fetchBoardFile, loadUserBoards, mergeCatalog } from '../../boards/boardCatalog';
import type { BoardCatalog } from '../../boards/types';

/**
 * The boards available here (docs/board_io_config_spec.md § 6.3): the built-in ones at
 * once, so the first render never waits, then the user's `boards/boards.json` as soon as
 * it is fetched. A project opened before that keeps its board id, and simply finds its
 * board on the next render. The file's problems are logged once for the expert who
 * edited it, and listed in Settings › Board.
 */
export function useBoards(): BoardCatalog {
  const [catalog, setCatalog] = useState<BoardCatalog>(BUILT_IN_CATALOG);
  useEffect(() => {
    let cancelled = false;
    void loadUserBoards(fetchBoardFile).then((user) => {
      if (cancelled) return;
      const merged = mergeCatalog(BUILT_IN_BOARDS, user);
      for (const warning of merged.warnings) console.warn(warning);
      setCatalog(merged);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return catalog;
}
