// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  DEFAULT_SPLIT_PREFS,
  SPLIT_DEFAULT_TB_FRACTION,
  SPLIT_DIVIDER_W,
  SPLIT_PANE_MIN_W,
  canSplit,
  clampFraction,
  fractionBounds,
  fractionForKey,
  loadEditorSplitPrefs,
  saveEditorSplitPrefs,
  type EditorSplitPrefs,
  type FractionBounds,
} from './editorSplit';
import type { PaneRole, SplitPreference } from './editorView';
import { collapsesAt } from './paneLayout';

export interface EditorSplit {
  readonly prefs: EditorSplitPrefs;
  readonly setPreference: (preference: SplitPreference) => void;
  /** Measured on `.wb-split`; 0 until it is mounted. */
  readonly columnWidth: number;
  readonly canSplit: boolean;
  readonly bounds: FractionBounds;
  /** The pane a drag in progress has snapped shut, shown at zero width until release. */
  readonly dragCollapsed: PaneRole | null;
  readonly columnRef: (element: HTMLDivElement | null) => void;
  readonly onDividerPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onDividerKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  readonly resetFraction: () => void;
}

export interface EditorSplitHandlers {
  /** A drag snapped this pane shut and was released: show only the other one. */
  readonly onCollapse: (pane: PaneRole) => void;
}

/**
 * The split divider (docs/impl_split_screen.md § 4.8): the same pointer-capture
 * technique and snap-to-collapse rule as usePaneLayout's dividers, plus the WAI-ARIA
 * window-splitter keys. Fraction and preference live in localStorage.
 */
export function useEditorSplit(handlers: EditorSplitHandlers): EditorSplit {
  const [prefs, setPrefs] = useState(() => loadEditorSplitPrefs(DEFAULT_SPLIT_PREFS));
  const [columnWidth, setColumnWidth] = useState(0);
  const [dragCollapsed, setDragCollapsed] = useState<PaneRole | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const columnWidthRef = useRef(columnWidth);
  columnWidthRef.current = columnWidth;
  const observer = useRef<ResizeObserver | null>(null);

  const update = useCallback((next: Partial<EditorSplitPrefs>, store = true) => {
    const merged = { ...prefsRef.current, ...next };
    prefsRef.current = merged;
    setPrefs(merged);
    if (store) saveEditorSplitPrefs(merged);
  }, []);

  const columnRef = useCallback((element: HTMLDivElement | null) => {
    observer.current?.disconnect();
    if (!element) return;
    observer.current = new ResizeObserver(() => setColumnWidth(element.getBoundingClientRect().width));
    observer.current.observe(element);
    setColumnWidth(element.getBoundingClientRect().width);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);

  const bounds = fractionBounds(columnWidth);
  const onDividerPointerDown = useDividerDrag(columnWidthRef, prefsRef, update, setDragCollapsed, handlersRef);

  const onDividerKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = fractionForKey(e.key, e.shiftKey, prefsRef.current.tbFraction, bounds);
    if (next === undefined) return;
    e.preventDefault();
    if (next === 'collapse') handlersRef.current.onCollapse('tb');
    else update({ tbFraction: next });
  };

  return {
    prefs,
    setPreference: (preference) => update({ preference }),
    columnWidth,
    canSplit: columnWidth === 0 || canSplit(columnWidth),
    bounds,
    dragCollapsed,
    columnRef,
    onDividerPointerDown,
    onDividerKeyDown,
    resetFraction: () => update({ tbFraction: SPLIT_DEFAULT_TB_FRACTION }),
  };
}

type Ref<T> = { readonly current: T };

/** Drag: resize, snap a pane shut under half its minimum, reopen within the same drag. */
function useDividerDrag(
  columnWidth: Ref<number>,
  prefs: Ref<EditorSplitPrefs>,
  update: (next: Partial<EditorSplitPrefs>, store?: boolean) => void,
  setDragCollapsed: (pane: PaneRole | null) => void,
  handlers: Ref<EditorSplitHandlers>,
) {
  return (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const room = columnWidth.current - SPLIT_DIVIDER_W;
    const startTb = prefs.current.tbFraction * room;
    const startX = e.clientX;
    let collapsed: PaneRole | null = null;
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('is-dragging');
    document.body.classList.add('wb-is-resizing-x');

    const onMove = (ev: PointerEvent) => {
      const tb = startTb + ev.clientX - startX;
      collapsed = collapsesAt(tb, SPLIT_PANE_MIN_W) ? 'tb' : collapsesAt(room - tb, SPLIT_PANE_MIN_W) ? 'rtl' : null;
      setDragCollapsed(collapsed);
      if (!collapsed) update({ tbFraction: clampFraction(tb / room, fractionBounds(columnWidth.current)) }, false);
    };
    const onUp = () => {
      document.body.classList.remove('wb-is-resizing-x');
      handle.classList.remove('is-dragging');
      handle.releasePointerCapture(e.pointerId);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      setDragCollapsed(null);
      update({}, true);
      if (collapsed) handlers.current.onCollapse(collapsed);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };
}
