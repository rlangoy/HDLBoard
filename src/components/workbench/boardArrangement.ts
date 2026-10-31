// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** Where the Board pane's panels go (docs/imp_rearrange_board_io.md). */

import type { BoardPanel } from '../../project/types';
import type { BoardLayout } from './boardLayoutPreference';

/** Outputs on top, inputs underneath, read row by row in two columns. */
const TWO_COLUMN_ORDER: readonly BoardPanel[] = ['leds', 'sevenSegment', 'switches', 'pushbuttons'];
/** Each bank next to its sibling: LEDs above switches, then the displays and the buttons. */
const SINGLE_COLUMN_ORDER: readonly BoardPanel[] = ['leds', 'switches', 'sevenSegment', 'pushbuttons'];

/** The panels in the order they are drawn: the saved order, else the layout's own. */
export function arrangedPanels(saved: readonly BoardPanel[] | undefined, layout: BoardLayout): readonly BoardPanel[] {
  if (saved) return saved;
  return layout === 'single-column' ? SINGLE_COLUMN_ORDER : TWO_COLUMN_ORDER;
}

/** The order to keep in the project: none when it is the layout's own, so moving the panels back leaves nothing to save. */
export function orderToSave(order: readonly BoardPanel[], layout: BoardLayout): BoardPanel[] | undefined {
  const own = arrangedPanels(undefined, layout);
  return order.every((panel, index) => panel === own[index]) ? undefined : [...order];
}

/** The class each panel's root element carries, collapsed or not; the reset button belongs with the buttons. */
const PANEL_CLASSES: readonly (readonly [string, BoardPanel])[] = [
  ['pb-leds', 'leds'],
  ['pb-sevenseg', 'sevenSegment'],
  ['pb-switches', 'switches'],
  ['pb-pushbuttons', 'pushbuttons'],
  ['pb-reset', 'pushbuttons'],
];

/** The panel a board cell (a direct child of the board) shows, if any. */
export function panelOfCell(cell: Element): BoardPanel | undefined {
  return PANEL_CLASSES.find(([name]) => cell.classList.contains(name))?.[1];
}
