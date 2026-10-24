// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The boards available here (docs/board_io_config_spec.md § 6.3): the built-in ones,
 * compiled in so a broken user file can never take them away, then the user's
 * `boards/boards.json`, fetched at start-up.
 */

import builtinBoardFile from './builtinBoards.json';
import { clashWithEarlier, parseBoardFile } from './parseBoards';
import type { BoardCatalog, BoardDefinition, ParsedBoards } from './types';

export const DEFAULT_BOARD_ID = 'default';
/** Relative to the page, so every build (dev, GitHub Pages, Docker, Windows app) finds its own copy. */
export const USER_BOARD_FILE = 'boards/boards.json';

function parseBuiltInBoards(): readonly BoardDefinition[] {
  const parsed = parseBoardFile(JSON.stringify(builtinBoardFile), { fileName: 'builtinBoards.json', origin: 'built-in' });
  if (parsed.warnings.length > 0) throw new Error(`Invalid built-in board file: ${parsed.warnings.join(' ')}`);
  return parsed.boards;
}

export const BUILT_IN_BOARDS: readonly BoardDefinition[] = parseBuiltInBoards();

function builtInBoard(id: string): BoardDefinition {
  const board = BUILT_IN_BOARDS.find((candidate) => candidate.id === id);
  if (board === undefined) throw new Error(`No built-in board "${id}"`);
  return board;
}

/** The board every built-in source is written for, and the fallback for a board that is not installed. */
export const DEFAULT_BOARD: BoardDefinition = builtInBoard(DEFAULT_BOARD_ID);

export const BUILT_IN_CATALOG: BoardCatalog = { boards: BUILT_IN_BOARDS, warnings: [] };

/** The built-ins, then each user board whose id and name are still free (the built-ins win). */
export function mergeCatalog(builtIn: readonly BoardDefinition[], user: ParsedBoards): BoardCatalog {
  const boards = [...builtIn];
  const warnings = [...user.warnings];
  for (const board of user.boards) {
    const clash = clashWithEarlier(board, boards);
    if (clash === undefined) boards.push(board);
    else warnings.push(`${USER_BOARD_FILE}: board "${board.id}" was skipped: ${clash}.`);
  }
  return { boards, warnings };
}

export interface FoundBoard {
  readonly board: BoardDefinition;
  /** False when the id names no board here: `board` is then the Default board. */
  readonly installed: boolean;
}

export function findBoard(catalog: BoardCatalog, id: string): FoundBoard {
  const board = catalog.boards.find((candidate) => candidate.id === id);
  return board === undefined ? { board: DEFAULT_BOARD, installed: false } : { board, installed: true };
}

/** What a fetch of the user file gave: its text, `undefined` for a 404, or why it failed. */
export type FetchedText =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'missing' }
  | { readonly kind: 'failed'; readonly reason: string };

/** The file is optional: a 404 is no board and no warning; any other failure is one warning. */
export async function loadUserBoards(fetchText: (url: string) => Promise<FetchedText>): Promise<ParsedBoards> {
  let fetched: FetchedText;
  try {
    fetched = await fetchText(USER_BOARD_FILE);
  } catch (error) {
    fetched = { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
  if (fetched.kind === 'missing') return { boards: [], warnings: [] };
  if (fetched.kind === 'failed') return couldNotLoad(fetched.reason);
  if (fetched.text.trim() === '') return couldNotLoad('the file is empty');
  return parseBoardFile(fetched.text, { fileName: USER_BOARD_FILE, origin: 'user' });
}

function couldNotLoad(reason: string): ParsedBoards {
  return { boards: [], warnings: [`${USER_BOARD_FILE} could not be loaded: ${reason}.`] };
}

/** The browser's fetch, as `loadUserBoards` wants it; never cached, so an edited file is read on the next start. */
export async function fetchBoardFile(url: string): Promise<FetchedText> {
  const response = await fetch(url, { cache: 'no-cache' });
  if (response.status === 404) return { kind: 'missing' };
  if (!response.ok) return { kind: 'failed', reason: `HTTP ${response.status}` };
  return { kind: 'text', text: await response.text() };
}
