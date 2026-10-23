// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * What the drag layer draws while a signal is reordered (docs/imp_wave_rearange.md
 * § 5.5), in a tiny store of its own: the pointer moves many times a second, and only
 * the layer reads this, so neither the list nor the canvas re-renders while it moves.
 */

import type { Block, DropTarget, Section } from './signalOrder';

/** The signal being dragged and the section it stays in. */
export interface Dragged {
  readonly block: Block;
  readonly section: Section;
  /** The block's index in its section. */
  readonly from: number;
}

export type DragView =
  | { readonly kind: 'idle' }
  /** The ghost's top follows the pointer; the target says what a release there does. */
  | { readonly kind: 'dragging'; readonly dragged: Dragged; readonly ghostTop: number; readonly target: DropTarget }
  /** A cancelled drag: the ghost glides back to where the signal is. */
  | { readonly kind: 'returning'; readonly dragged: Dragged }
  /** A signal just moved: its rows flash once. `id` tells two moves of the same signal apart. */
  | { readonly kind: 'landed'; readonly path: string; readonly id: number };

export interface DragStore {
  get(): DragView;
  set(view: DragView): void;
  subscribe(listener: () => void): () => void;
}

export const IDLE: DragView = { kind: 'idle' };

export function createDragStore(): DragStore {
  let view: DragView = IDLE;
  const listeners = new Set<() => void>();
  return {
    get: () => view,
    set: (next) => {
      view = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
