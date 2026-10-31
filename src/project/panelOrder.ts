// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The order of the Board pane's panels, saved as `displaySettings.panelOrder`
 * (docs/imp_rearrange_board_io.md). An optional field, so the project file version
 * stays the same: an HDLBoard that does not know it ignores it.
 */

import { BOARD_PANELS, type BoardPanel, type Diagnostic } from './types';

const INVALID_ORDER = 'Invalid displaySettings.panelOrder; the Board panels keep their own order.';

/**
 * Read a saved order forgivingly: unknown and repeated names are dropped and panels it
 * leaves out go last, so every panel is shown once. No panel named → no order (the
 * layout's own); not a list → no order, with a warning.
 */
export function parsePanelOrder(raw: unknown, warnings: Diagnostic[]): BoardPanel[] | undefined {
  if (!Array.isArray(raw)) {
    warnings.push({ severity: 'warning', message: INVALID_ORDER });
    return undefined;
  }
  const named = raw.filter(isBoardPanel);
  return named.length ? completeOrder(named) : undefined;
}

/** The order with two panels changing places; the others stay where they are. */
export function swapPanels(order: readonly BoardPanel[], first: BoardPanel, second: BoardPanel): BoardPanel[] {
  return order.map((panel) => {
    if (panel === first) return second;
    if (panel === second) return first;
    return panel;
  });
}

function completeOrder(panels: readonly BoardPanel[]): BoardPanel[] {
  const unique = [...new Set(panels)];
  return [...unique, ...BOARD_PANELS.filter((panel) => !unique.includes(panel))];
}

function isBoardPanel(value: unknown): value is BoardPanel {
  return BOARD_PANELS.includes(value as BoardPanel);
}
