// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Dragging a Board pane panel by its frame to another place (docs/imp_rearrange_board_io.md).
 * A copy of the panel follows the pointer; the panel itself stays in the grid as the
 * placeholder, and the others slide aside as it moves, so the board always shows the
 * order a release gives. The preview is CSS `order` on the cells and nothing re-renders
 * until the drop.
 */

import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { flushSync } from 'react-dom';
import type { BoardPanel } from '../../project/types';
import { DRAG_THRESHOLD_PX, swallowNextClick } from '../dragGesture';
import { moveItem, panelOfCell, passesMiddle, type Box } from './boardArrangement';

const DRAG_ATTRIBUTE = 'data-board-drag';
const DRAGGING_ATTRIBUTE = 'data-board-dragging';
const DROPPED_ATTRIBUTE = 'data-board-dropped';
const GHOST_CLASS = 'pb-board__ghost';
/** A panel's frame: its header band, or the whole button of a collapsed panel. */
const FRAME = '.pb-panel__header, .pb-io-collapsed';
/** Controls in a panel's header keep their own meaning: a press on them never drags. */
const HEADER_CONTROLS = 'button, input, select, a, [role="menu"]';
const SLIDE = { duration: 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' };
const LIFTED_SHADOW = '0 14px 32px #0003';

/** The panels on show, in their new order. */
export type PanelArrange = (shown: BoardPanel[]) => void;

interface Drag {
  board: HTMLElement;
  source: HTMLElement;
  startX: number;
  startY: number;
  /** Where in the panel it was grabbed, in board pixels. */
  grabX: number;
  grabY: number;
  /** The cells in the order shown; the source among them is the placeholder. */
  cells: HTMLElement[];
  original: HTMLElement[];
  ghost?: HTMLElement;
  /** Esc was pressed: the panels are back, and the release changes nothing. */
  cancelled: boolean;
  onArrange: PanelArrange;
}

/** The board's pointer-down handler that starts a drag, or undefined when the panels stay put. */
export function usePanelDrag(onArrange: PanelArrange | undefined): ((event: ReactPointerEvent<HTMLElement>) => void) | undefined {
  const stopActive = useRef<() => void>();
  useEffect(() => () => stopActive.current?.(), []);
  if (!onArrange) return undefined;
  return (event) => {
    const drag = pressedDrag(event, onArrange);
    if (!drag) return;
    stopActive.current?.();
    stopActive.current = listenTo(drag);
  };
}

function pressedDrag(event: ReactPointerEvent<HTMLElement>, onArrange: PanelArrange): Drag | undefined {
  const board = event.currentTarget;
  const pressed = event.target as Element;
  if (event.button !== 0 || !isFrame(pressed)) return undefined;
  const source = cellOf(pressed, board);
  if (!(source instanceof HTMLElement) || !panelOfCell(source)) return undefined;
  const cells = shownCells(board);
  return { board, source, startX: event.clientX, startY: event.clientY, grabX: 0, grabY: 0, cells, original: cells, cancelled: false, onArrange };
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

function shownCells(board: HTMLElement): HTMLElement[] {
  return [...board.children].filter((cell): cell is HTMLElement =>
    cell instanceof HTMLElement && !cell.classList.contains(GHOST_CLASS) && panelOfCell(cell) !== undefined);
}

/** Follow the pointer until it is released; returns what stops the drag at once, without a drop. */
function listenTo(drag: Drag): () => void {
  const session = new AbortController();
  const options = { signal: session.signal };
  const end = () => session.abort();
  window.addEventListener('pointermove', (event) => follow(drag, event), options);
  window.addEventListener('pointerup', () => { end(); drop(drag); }, options);
  window.addEventListener('pointercancel', () => { end(); cancel(drag); }, options);
  window.addEventListener('blur', () => { end(); cancel(drag); }, options);
  window.addEventListener('keydown', (event) => cancelOnEscape(drag, event), { ...options, capture: true });
  return () => { end(); putBack(drag); };
}

function follow(drag: Drag, event: PointerEvent): void {
  if (drag.cancelled) return;
  if (!drag.ghost) {
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD_PX) return;
    lift(drag);
  }
  placeGhost(drag, event);
  makeRoomUnder(drag, event);
}

/** The panel becomes the placeholder and a copy of it follows the pointer. */
function lift(drag: Drag): void {
  const { board, source } = drag;
  const scale = boardScale(board);
  const box = source.getBoundingClientRect();
  drag.grabX = (drag.startX - box.left) / scale;
  drag.grabY = (drag.startY - box.top) / scale;
  // The board keeps its width while panels move, so its scale – and the pointer's grip – stay put.
  board.style.width = `${board.offsetWidth}px`;
  board.setAttribute(DRAGGING_ATTRIBUTE, '');
  drag.ghost = ghostOf(source);
  board.append(drag.ghost);
  source.setAttribute(DRAG_ATTRIBUTE, 'placeholder');
}

function ghostOf(source: HTMLElement): HTMLElement {
  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.classList.add(GHOST_CLASS);
  ghost.removeAttribute('id');
  ghost.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  ghost.style.width = `${source.offsetWidth}px`;
  ghost.style.height = `${source.offsetHeight}px`;
  return ghost;
}

function placeGhost(drag: Drag, event: PointerEvent): void {
  const { board, ghost } = drag;
  if (!ghost) return;
  const scale = boardScale(board);
  const origin = board.getBoundingClientRect();
  const x = (event.clientX - origin.left) / scale - board.clientLeft - drag.grabX;
  const y = (event.clientY - origin.top) / scale - board.clientTop - drag.grabY;
  ghost.style.translate = `${x}px ${y}px`;
}

/** Over another panel, past its middle: the dragged panel takes its place and the others slide aside. */
function makeRoomUnder(drag: Drag, event: PointerEvent): void {
  const over = cellUnder(drag, event);
  if (!over) return;
  const pointer = { x: event.clientX, y: event.clientY };
  if (!passesMiddle(pointer, boxOf(over), boxOf(drag.source))) return;
  const before = boxesOf(drag.cells);
  drag.cells = moveItem(drag.cells, drag.source, over);
  showOrder(drag.cells);
  slideFrom(before, drag.cells.filter((cell) => cell !== drag.source), boardScale(drag.board));
}

/**
 * The other panel under the pointer; the copy lets the pointer through (Board.css).
 * A panel still sliding aside is not yet where it goes, so it does not count.
 */
function cellUnder(drag: Drag, event: PointerEvent): HTMLElement | undefined {
  const under = document.elementFromPoint(event.clientX, event.clientY);
  const cell = under ? cellOf(under, drag.board) : undefined;
  if (!cell || cell === drag.source || isSliding(cell)) return undefined;
  return drag.cells.find((each) => each === cell);
}

function isSliding(cell: Element): boolean {
  return cell.getAnimations().some((animation) => animation.playState === 'running');
}

function showOrder(cells: readonly HTMLElement[]): void {
  cells.forEach((cell, index) => { cell.style.order = String(index); });
}

/** Esc puts the panels back at once; the drag lasts until the release, whose click it swallows. */
function cancelOnEscape(drag: Drag, event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !drag.ghost || drag.cancelled) return;
  event.preventDefault();
  event.stopPropagation();
  cancel(drag);
}

/** Every panel glides back to where it was before the drag. */
function cancel(drag: Drag): void {
  if (!drag.ghost || drag.cancelled) { putBack(drag); return; }
  drag.cancelled = true;
  const before = boxesOf(drag.cells);
  const from = drag.ghost.getBoundingClientRect();
  putBack(drag);
  const scale = boardScale(drag.board);
  slideFrom(before, drag.original.filter((cell) => cell !== drag.source), scale);
  settle(drag.source, from, scale);
}

/** The release keeps the order on show: the panel settles into its place, and its border flashes. */
function drop(drag: Drag): void {
  if (!drag.ghost) { putBack(drag); return; }
  swallowNextClick();
  if (drag.cancelled) { putBack(drag); return; }
  const from = drag.ghost.getBoundingClientRect();
  const moved = drag.cells.some((cell, index) => cell !== drag.original[index]);
  const shown = drag.cells.map((cell) => panelOfCell(cell)).filter((panel): panel is BoardPanel => panel !== undefined);
  putBack(drag);
  // React puts the panels in their new order now, so the panel can settle into its place.
  if (moved) flushSync(() => drag.onArrange(shown));
  if (!drag.source.isConnected) return;
  settle(drag.source, from, boardScale(drag.board));
  if (moved) flash(drag.source);
}

/** Slide each cell from its old place to its new one (a FLIP animation). */
function slideFrom(before: Map<HTMLElement, DOMRect>, cells: readonly HTMLElement[], scale: number): void {
  if (prefersLessMotion()) return;
  for (const cell of cells) {
    const old = before.get(cell);
    if (!old) continue;
    const now = cell.getBoundingClientRect();
    const dx = (old.left - now.left) / scale;
    const dy = (old.top - now.top) / scale;
    if (dx || dy) cell.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], SLIDE);
  }
}

/** The panel moves from where the copy was let go into its place, its shadow fading. */
function settle(cell: HTMLElement, from: DOMRect, scale: number): void {
  if (prefersLessMotion()) return;
  const now = cell.getBoundingClientRect();
  const offset = `${(from.left - now.left) / scale}px ${(from.top - now.top) / scale}px`;
  cell.animate([{ translate: offset, boxShadow: LIFTED_SHADOW }, { translate: '0 0', boxShadow: 'none' }], SLIDE);
}

function flash(cell: HTMLElement): void {
  cell.setAttribute(DROPPED_ATTRIBUTE, '');
  cell.addEventListener('animationend', () => cell.removeAttribute(DROPPED_ATTRIBUTE), { once: true });
}

/** Undo everything the drag changed on the page; the order on show goes back to the DOM order. */
function putBack(drag: Drag): void {
  const { board, source } = drag;
  drag.ghost?.remove();
  board.removeAttribute(DRAGGING_ATTRIBUTE);
  board.style.removeProperty('width');
  source.removeAttribute(DRAG_ATTRIBUTE);
  drag.original.forEach((cell) => cell.style.removeProperty('order'));
}

/** The Board pane scales the board to fit; the pointer moves in screen pixels. */
function boardScale(board: HTMLElement): number {
  const shown = board.getBoundingClientRect().width;
  return board.offsetWidth > 0 && shown > 0 ? shown / board.offsetWidth : 1;
}

function boxOf(cell: HTMLElement): Box {
  const { left, top, width, height } = cell.getBoundingClientRect();
  return { left, top, width, height };
}

function boxesOf(cells: readonly HTMLElement[]): Map<HTMLElement, DOMRect> {
  return new Map(cells.map((cell) => [cell, cell.getBoundingClientRect()]));
}

function prefersLessMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
