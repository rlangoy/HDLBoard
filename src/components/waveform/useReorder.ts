// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Reordering the shown signals (docs/imp_wave_rearange.md): by dragging a name or its
 * grip, by Alt + ↑ / ↓, and from the right-click menu. Every move goes the same way –
 * the view's `move` action, the signal selected, its rows flashed once, and a sentence
 * for screen readers – so the three ways cannot drift apart.
 */

import { useCallback, useMemo, useRef, useState, type PointerEvent } from 'react';
import { createDragStore, type DragStore } from './dragStore';
import { startRowDrag, startsDrag, type DragFrame } from './rowDragGesture';
import { blockOf, fitsOrder, movablePaths, placeOf, sectionsOf, stepMove, type Move, type MoveStep, type Section } from './signalOrder';
import type { SignalPath } from './signalRows';
import type { WaveView } from './useWaveView';

export interface Reorder {
  readonly sections: readonly Section[];
  readonly canMove: (path: SignalPath) => boolean;
  /** Whether `step` would move the signal: false at the edge it is already at. */
  readonly canStep: (path: SignalPath, step: MoveStep) => boolean;
  readonly step: (path: SignalPath, step: MoveStep) => void;
  /** A press on a movable signal's name or grip, which may become a drag. */
  readonly press: (path: SignalPath, event: PointerEvent<HTMLElement>) => void;
  readonly store: DragStore;
  /** The grid holding the list and the canvas, where drags are measured. */
  readonly onGridElement: (element: HTMLDivElement | null) => void;
  /** What the last move did, in words, for a live region. */
  readonly announcement: string;
}

export interface ReorderInput {
  readonly view: WaveView;
  /** The scrolling body, which a drag near its edge scrolls. */
  readonly body: HTMLDivElement | null;
  readonly select: (path: SignalPath) => void;
}

/** The one way every move is done: moved, selected, flashed and announced. */
function useApplyMove({ view, select }: ReorderInput, store: DragStore) {
  const [announcement, setAnnouncement] = useState('');
  const landings = useRef(0);
  // The order as it is now: a drop may come after a new waveform changed it.
  const shown = useRef(view.setup?.list.shown ?? []);
  shown.current = view.setup?.list.shown ?? [];
  const { move: moveAction } = view.actions;
  const apply = useCallback(
    (move: Move) => {
      if (!fitsOrder(shown.current, move)) return;
      const { path, label } = move.section.blocks[move.from];
      const { place, of } = placeOf(move);
      moveAction(move);
      select(path);
      landings.current += 1;
      store.set({ kind: 'landed', path, id: landings.current });
      setAnnouncement(`${label} moved to place ${place} of ${of} in ${move.section.label}.`);
    },
    [moveAction, select, store],
  );
  return { apply, announcement };
}

export function useReorder(input: ReorderInput): Reorder {
  const store = useMemo(createDragStore, []);
  const sections = useMemo(() => sectionsOf(input.view.list), [input.view.list]);
  // Asked once per row on every render of the list: a set, not a search.
  const movable = useMemo(() => movablePaths(sections), [sections]);
  const { apply, announcement } = useApplyMove(input, store);
  const [grid, setGrid] = useState<HTMLDivElement | null>(null);
  const { body } = input;
  const press = (path: SignalPath, event: PointerEvent<HTMLElement>) => {
    const found = blockOf(sections, path);
    if (!startsDrag(event) || found === undefined || grid === null || body === null) return;
    const frame: DragFrame = { body, grid };
    const dragged = { block: found.section.blocks[found.index], section: found.section, from: found.index };
    startRowDrag(
      { pointerId: event.pointerId, x: event.clientX, y: event.clientY, element: event.currentTarget, dragged },
      { sections, frame, store, onDrop: apply },
    );
  };
  const step = (path: SignalPath, moveStep: MoveStep) => {
    const move = stepMove(sections, path, moveStep);
    if (move !== null) apply(move);
  };
  return {
    sections,
    canMove: (path) => movable.has(path),
    canStep: (path, moveStep) => stepMove(sections, path, moveStep) !== null,
    step,
    press,
    store,
    onGridElement: setGrid,
    announcement,
  };
}
