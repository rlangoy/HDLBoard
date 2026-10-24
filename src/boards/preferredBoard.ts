// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The board new projects get (docs/board_io_config_spec.md § 6.4, D3): the board the
 * student last chose, kept in localStorage. It is written when the student changes the
 * board (or an Undo restores one), never when a project is opened — opening a shared
 * project does not change what *your* new projects get.
 *
 * Stored as the board id only, a JSON string, under `hdlboard.board.v1`. Anything else
 * — nothing stored, text that is not a JSON string, an id that is not installed — reads
 * as the Default board. A later change of shape gets a new key (`.v2`) that falls back
 * to reading this one. The two localStorage helpers never throw.
 */

import { DEFAULT_BOARD_ID, findBoard } from './boardCatalog';
import type { BoardCatalog } from './types';

const STORAGE_KEY = 'hdlboard.board.v1';

/** The stored id, or the Default board's when nothing usable is stored. */
export function parsePreferredBoard(json: string | null): string {
  try {
    const raw: unknown = JSON.parse(json ?? 'null');
    return typeof raw === 'string' && raw !== '' ? raw : DEFAULT_BOARD_ID;
  } catch {
    return DEFAULT_BOARD_ID;
  }
}

export function loadPreferredBoard(): string {
  try {
    return parsePreferredBoard(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_BOARD_ID;
  }
}

export function savePreferredBoard(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(id));
  } catch {
    // Storage blocked or full: the choice just isn't remembered.
  }
}

/** The preferred board, if it is installed here; else the Default board. */
export function preferredBoardIn(catalog: BoardCatalog, preferred: string): string {
  return findBoard(catalog, preferred).installed ? preferred : DEFAULT_BOARD_ID;
}
