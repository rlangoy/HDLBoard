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

/** The list with `item` taking the place of `target`; the items between shift one step towards where it was. */
export function moveItem<T>(items: readonly T[], item: T, target: T): T[] {
  const rest = items.filter((each) => each !== item);
  const at = items.indexOf(target);
  return at < 0 || !items.includes(item) ? [...items] : [...rest.slice(0, at), item, ...rest.slice(at)];
}

export interface Point { x: number; y: number }
export interface Box { left: number; top: number; width: number; height: number }

/**
 * Whether the pointer has gone past the middle of the panel it is over, coming from
 * the dragged panel's place (in reading order): sideways in the same row, else up or down. Only then does
 * the dragged panel take its place, so a short panel and a tall one cannot keep
 * trading places under a still pointer.
 */
export function passesMiddle(pointer: Point, over: Box, from: Box): boolean {
  const sameRow = Math.abs(over.top - from.top) < 1;
  const along = sameRow ? pointer.x - (over.left + over.width / 2) : pointer.y - (over.top + over.height / 2);
  const later = sameRow ? over.left > from.left : over.top > from.top;
  return later ? along > 0 : along < 0;
}
