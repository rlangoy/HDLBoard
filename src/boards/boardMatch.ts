// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The name-mismatch hint before a run (docs/board_io_config_spec.md § 3.5, § 6.10):
 * the top unit declares ports that another installed board has, but the active one
 * does not. Chosen so it cannot fire by coincidence — names two boards share (`SW`,
 * `LEDR`) never count, and a tie between two boards gives no hint.
 */

import { portKeysOf } from './boardPorts';
import type { BoardCatalog, BoardDefinition } from './types';

export interface ForeignNames {
  readonly board: BoardDefinition;
  /** The declared ports that gave it away, as the design spells them. */
  readonly names: readonly string[];
}

/** Ports the top declares that the active board does not have but another installed board does. */
export function foreignBoardNames(
  declaredPorts: readonly string[],
  catalog: BoardCatalog,
  active: BoardDefinition,
): ForeignNames | undefined {
  const activeKeys = portKeysOf(active);
  const notOnActive = declaredPorts.filter((name) => !activeKeys.has(name.toLowerCase()));
  if (notOnActive.length === 0) return undefined;

  const candidates = catalog.boards
    .filter((board) => board.id !== active.id)
    .map((board) => {
      const keys = portKeysOf(board);
      return { board, names: notOnActive.filter((name) => keys.has(name.toLowerCase())) };
    })
    .filter((candidate) => candidate.names.length > 0)
    .sort((a, b) => b.names.length - a.names.length);

  const [best, runnerUp] = candidates;
  if (best === undefined || best.names.length === runnerUp?.names.length) return undefined;
  return best;
}
