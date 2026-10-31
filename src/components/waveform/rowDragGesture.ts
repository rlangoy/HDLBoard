// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Dragging a signal by its name or grip to another place in its section
 * (docs/imp_wave_rearange.md § 5.3). Nothing moves until the pointer has travelled
 * `DRAG_THRESHOLD_PX`, so a click, a tick and a double-click on the name work as before.
 * From then on the pointer is captured by the pressed element, so the canvas never sees
 * it and cannot start a zoom (§ 5.4). Near the top or bottom of the list the body
 * scrolls. Esc, a right-click, a lost window or a release where no line is shown cancel
 * the drag; Esc is kept from the pane, which would close the view.
 */

import { IDLE, type DragStore, type Dragged } from './dragStore';
import { dropTargetAt, type DropTarget, type Move, type Section } from './signalOrder';
import { DRAG_THRESHOLD_PX, swallowNextClick } from '../dragGesture';
import { AXIS_HEIGHT, ROW_HEIGHT } from './waveDraw';

/** How close to the list's top or bottom edge the pointer scrolls it. */
export const AUTO_SCROLL_ZONE_PX = 32;
/** At most one row per frame: fast enough for a long list, slow enough to stop where wanted. */
const MAX_SCROLL_PX_PER_FRAME = ROW_HEIGHT;
/** How long a cancelled drag's ghost takes to glide back (the CSS transition's length). */
export const SNAP_BACK_MS = 160;
const MAIN_BUTTON = 0;
/** Set on <html> while a drag is on: the cursor everywhere, and no text selection. */
const DRAG_ATTRIBUTE = 'data-wv-reordering';

/** The elements a drag is measured in. */
export interface DragFrame {
  /** The scrolling body of the view. */
  readonly body: HTMLElement;
  /** The grid holding the list and the canvas: the list starts `AXIS_HEIGHT` below its top. */
  readonly grid: HTMLElement;
}

export interface DragInput {
  readonly sections: readonly Section[];
  readonly frame: DragFrame;
  readonly store: DragStore;
  readonly onDrop: (move: Move, dragged: Dragged) => void;
}

/** A press on a grip or a name: where, by which pointer, on what. */
export interface Press {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly element: HTMLElement;
  readonly dragged: Dragged;
}

/** Pixels per frame to scroll the list with the pointer at `y`: negative up, 0 outside the edge zones. */
export function autoScrollSpeed(y: number, box: { readonly top: number; readonly bottom: number }): number {
  const topEdge = box.top + AXIS_HEIGHT + AUTO_SCROLL_ZONE_PX;
  const bottomEdge = box.bottom - AUTO_SCROLL_ZONE_PX;
  const depth = y < topEdge ? y - topEdge : y > bottomEdge ? y - bottomEdge : 0;
  const share = Math.min(1, Math.abs(depth) / AUTO_SCROLL_ZONE_PX);
  return Math.sign(depth) * Math.round(MAX_SCROLL_PX_PER_FRAME * share * share);
}

type PressKeys = Pick<PointerEvent, 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>;

/** Whether a pointer press may start a drag: the main button, without a modifier key. */
export const startsDrag = (event: PressKeys): boolean =>
  event.button === MAIN_BUTTON && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;

/** Follows a press on a grip or a name until it is released or cancelled. */
export function startRowDrag(press: Press, input: DragInput): void {
  new RowDragGesture(press, input).listen();
}

class RowDragGesture {
  private dragging = false;
  private lastY: number;
  private frameId = 0;
  private target: DropTarget = { kind: 'unchanged' };
  /** Where in the block the pointer took hold of it, so the ghost does not jump. */
  private readonly grabOffset: number;

  constructor(
    private readonly press: Press,
    private readonly input: DragInput,
  ) {
    this.lastY = press.y;
    this.grabOffset = this.listY(press.y) - press.dragged.block.top;
  }

  listen(): void {
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.cancel);
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('contextmenu', this.onContextMenu, true);
    window.addEventListener('blur', this.cancel);
  }

  /** Height in the list of a pointer at window `y`. */
  private listY(y: number): number {
    return y - this.input.frame.grid.getBoundingClientRect().top - AXIS_HEIGHT;
  }

  private readonly onMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.press.pointerId) return;
    this.lastY = event.clientY;
    if (!this.dragging && Math.hypot(event.clientX - this.press.x, event.clientY - this.press.y) < DRAG_THRESHOLD_PX) return;
    if (!this.dragging) this.begin();
    this.follow();
  };

  private begin(): void {
    this.dragging = true;
    this.press.element.setPointerCapture(this.press.pointerId);
    window.getSelection()?.removeAllRanges();
    this.frameId = requestAnimationFrame(this.scrollStep);
  }

  /** The ghost and the line to where the pointer is now. */
  private follow(): void {
    const y = this.listY(this.lastY);
    const { dragged } = this.press;
    this.target = dropTargetAt(this.input.sections, { own: dragged.section, from: dragged.from }, y);
    showDragCursor(this.target.kind === 'other-section' ? 'refused' : 'moving');
    this.input.store.set({ kind: 'dragging', dragged, ghostTop: y - this.grabOffset, target: this.target });
  }

  private readonly scrollStep = (): void => {
    const { body } = this.input.frame;
    const speed = autoScrollSpeed(this.lastY, body.getBoundingClientRect());
    if (speed !== 0) {
      body.scrollTop += speed;
      this.follow();
    }
    this.frameId = requestAnimationFrame(this.scrollStep);
  };

  private readonly onUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.press.pointerId) return;
    if (!this.dragging) return this.end();
    this.follow();
    this.finish(this.target.kind === 'slot' ? this.target.move : null);
  };

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.dragging) return;
    event.preventDefault();
    event.stopPropagation();
    this.cancel();
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    if (!this.dragging) return this.end();
    event.preventDefault();
    this.cancel();
  };

  private readonly cancel = (): void => (this.dragging ? this.finish(null) : this.end());

  /** Ends a drag: drops at `move`, or glides the ghost back. The click that follows a drag is not a click. */
  private finish(move: Move | null): void {
    const { dragged } = this.press;
    this.end();
    swallowNextClick();
    if (move !== null) return this.input.onDrop(move, dragged);
    const { store } = this.input;
    store.set({ kind: 'returning', dragged });
    window.setTimeout(() => {
      if (store.get().kind === 'returning') store.set(IDLE);
    }, SNAP_BACK_MS);
  }

  private end(): void {
    cancelAnimationFrame(this.frameId);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.cancel);
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('contextmenu', this.onContextMenu, true);
    window.removeEventListener('blur', this.cancel);
    showDragCursor(null);
    if (this.press.element.hasPointerCapture(this.press.pointerId)) this.press.element.releasePointerCapture(this.press.pointerId);
  }
}

/**
 * The cursor for the whole page while a drag is on, or none. Set only when it changes:
 * every change restyles the whole page, which would cost a frame on each pointer move.
 */
function showDragCursor(cursor: 'moving' | 'refused' | null): void {
  const root = document.documentElement;
  if (root.getAttribute(DRAG_ATTRIBUTE) === cursor) return;
  if (cursor === null) root.removeAttribute(DRAG_ATTRIBUTE);
  else root.setAttribute(DRAG_ATTRIBUTE, cursor);
}
