// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Dragging a Board pane panel by its frame onto another one, which makes the two
 * change places (docs/imp_rearrange_board_io.md). The drag only sets data attributes
 * and CSS variables, so nothing re-renders until the drop.
 */

import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { BoardPanel } from '../../project/types';
import { DRAG_THRESHOLD_PX, swallowNextClick } from '../dragGesture';
import { panelOfCell } from './boardArrangement';

const DRAG_ATTRIBUTE = 'data-board-drag';
const DRAGGING_ATTRIBUTE = 'data-board-dragging';
/** A panel's frame: its header band, or the whole button of a collapsed panel. */
const FRAME = '.pb-panel__header, .pb-io-collapsed';
/** Controls in a panel's header keep their own meaning: a press on them never drags. */
const HEADER_CONTROLS = 'button, input, select, a, [role="menu"]';

export type PanelSwap = (from: BoardPanel, to: BoardPanel) => void;

interface Drag {
  board: HTMLElement;
  source: HTMLElement;
  from: BoardPanel;
  startX: number;
  startY: number;
  moving: boolean;
  /** Esc was pressed: the panel is back in place, and the release changes nothing. */
  cancelled: boolean;
  target?: Element;
  onSwap: PanelSwap;
}

/** The board's pointer-down handler that starts a drag, or undefined when the panels stay put. */
export function usePanelDrag(onSwap: PanelSwap | undefined): ((event: ReactPointerEvent<HTMLElement>) => void) | undefined {
  const stopActive = useRef<() => void>();
  useEffect(() => () => stopActive.current?.(), []);
  if (!onSwap) return undefined;
  return (event) => {
    const drag = pressedDrag(event, onSwap);
    if (!drag) return;
    stopActive.current?.();
    stopActive.current = listenTo(drag);
  };
}

function pressedDrag(event: ReactPointerEvent<HTMLElement>, onSwap: PanelSwap): Drag | undefined {
  const board = event.currentTarget;
  const pressed = event.target as Element;
  if (event.button !== 0 || !isFrame(pressed)) return undefined;
  const source = cellOf(pressed, board);
  const from = source && panelOfCell(source);
  if (!(source instanceof HTMLElement) || !from) return undefined;
  return { board, source, from, startX: event.clientX, startY: event.clientY, moving: false, cancelled: false, onSwap };
}

function isFrame(element: Element): boolean {
  const frame = element.closest(FRAME);
  if (!frame) return false;
  return frame.matches('.pb-io-collapsed') || !element.closest(HEADER_CONTROLS);
}

/** The board cell (direct child of the board) that holds an element; none outside the board. */
function cellOf(element: Element, board: HTMLElement): Element | undefined {
  let cell: Element | null = element;
  while (cell && cell.parentElement !== board) cell = cell.parentElement;
  return cell ?? undefined;
}

/** Follow the pointer until it is released; returns what stops the drag without a drop. */
function listenTo(drag: Drag): () => void {
  const session = new AbortController();
  const options = { signal: session.signal };
  const stop = () => { session.abort(); putBack(drag); };
  window.addEventListener('pointermove', (event) => follow(drag, event), options);
  window.addEventListener('pointerup', () => { const to = droppedOn(drag); stop(); release(drag, to); }, options);
  window.addEventListener('pointercancel', stop, options);
  window.addEventListener('blur', stop, options);
  window.addEventListener('keydown', (event) => cancelOnEscape(drag, event), { ...options, capture: true });
  return stop;
}

function follow(drag: Drag, event: PointerEvent): void {
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  if (drag.cancelled || (!drag.moving && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX)) return;
  if (!drag.moving) lift(drag);
  const scale = boardScale(drag.board);
  drag.source.style.setProperty('--pb-drag-x', `${dx / scale}px`);
  drag.source.style.setProperty('--pb-drag-y', `${dy / scale}px`);
  markTarget(drag, cellUnder(drag, event));
}

function lift(drag: Drag): void {
  drag.moving = true;
  drag.board.setAttribute(DRAGGING_ATTRIBUTE, '');
  drag.source.setAttribute(DRAG_ATTRIBUTE, 'source');
}

/** The Board pane scales the board to fit; the pointer moves in screen pixels. */
function boardScale(board: HTMLElement): number {
  const shown = board.getBoundingClientRect().width;
  return board.offsetWidth > 0 && shown > 0 ? shown / board.offsetWidth : 1;
}

/** The other panel under the pointer; the lifted one lets the pointer through (Board.css). */
function cellUnder(drag: Drag, event: PointerEvent): Element | undefined {
  const under = document.elementFromPoint(event.clientX, event.clientY);
  const cell = under && cellOf(under, drag.board);
  return cell && cell !== drag.source && panelOfCell(cell) ? cell : undefined;
}

function markTarget(drag: Drag, target: Element | undefined): void {
  if (target === drag.target) return;
  drag.target?.removeAttribute(DRAG_ATTRIBUTE);
  target?.setAttribute(DRAG_ATTRIBUTE, 'target');
  drag.target = target;
}

/** Esc puts the panel back at once; the drag lasts until the release, whose click it swallows. */
function cancelOnEscape(drag: Drag, event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !drag.moving || drag.cancelled) return;
  event.preventDefault();
  event.stopPropagation();
  drag.cancelled = true;
  putBack(drag);
}

function droppedOn(drag: Drag): BoardPanel | undefined {
  return !drag.cancelled && drag.target ? panelOfCell(drag.target) : undefined;
}

function release(drag: Drag, to: BoardPanel | undefined): void {
  if (drag.moving) swallowNextClick();
  if (to) drag.onSwap(drag.from, to);
}

function putBack(drag: Drag): void {
  markTarget(drag, undefined);
  drag.board.removeAttribute(DRAGGING_ATTRIBUTE);
  drag.source.removeAttribute(DRAG_ATTRIBUTE);
  drag.source.style.removeProperty('--pb-drag-x');
  drag.source.style.removeProperty('--pb-drag-y');
}
