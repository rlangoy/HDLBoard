// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import {
  BOARD_DEFAULT_W,
  BOARD_MIN_W,
  SIDEBAR_DEFAULT_W,
  SIDEBAR_MIN_W,
  collapsesAt,
  fitSidePanes,
  loadPaneLayout,
  savePaneLayout,
  type ShrinkFirst,
  type SidePane,
  type SidePaneFlags,
} from './paneLayout';

/* ------------------------------------------------------------------ *
 * The Workbench's pane geometry as React state: the two side panes'
 * widths and whether each is shut, the console's height, the three
 * dividers that change them, the slide when a pane opens or shuts, and
 * the keyboard shortcuts. The arithmetic itself is paneLayout.ts's; see
 * the "Resizing" note in this folder's README.
 * ------------------------------------------------------------------ */

// The console's rules: a minimum it can't be dragged under, a starting
// height, and the height the panes above must keep. ROW_DIVIDER_H is the
// horizontal .wb-resizer's own height (Workbench.css).
const CONSOLE_MIN_H = 72;
const CONSOLE_DEFAULT_H = 180;
const BODY_MIN_H = 160;
const ROW_DIVIDER_H = 5;

// A little longer than --wb-pane-slide (Workbench.css): how long .is-sliding
// stays on .wb after a pane is opened or shut.
const SLIDE_MS = 260;

// An activity bar's width (Workbench.css's --wb-rail-w). Each rail shows only
// while its pane is shut, so opening or shutting a pane also gives .wb-body
// this much more or less room.
const RAIL_W = 44;

/** The element ids belonging to one side pane. */
export interface PaneElementIds {
  /** The pane itself — what its buttons and divider control (aria-controls). */
  pane: string;
  /** The pane's own Hide button, in its title strip. */
  hide: string;
  /** The activity bar that stands in for the pane while it is shut. */
  rail: string;
  /** That rail's Show button. */
  show: string;
}

const paneElementIds = (pane: string): PaneElementIds => ({
  pane,
  hide: `${pane}-hide`,
  rail: `${pane}-rail`,
  show: `${pane}-show`,
});

export const PANE_IDS: Record<SidePane, PaneElementIds> = {
  sidebar: paneElementIds('wb-explorer'),
  board: paneElementIds('wb-board-pane'),
};

/** Each pane's toggle shortcut, as tooltips show it; Cmd works as well as Ctrl. */
export const PANE_SHORTCUT: Record<SidePane, string> = {
  sidebar: 'Ctrl+B',
  board: 'Ctrl+Alt+B',
};

type ResizeAxis = 'x' | 'y';
type DividerPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => void;

export interface PaneLayoutState {
  /** On `.wb`: its height bounds the console, and it carries `.is-sliding`. */
  wbRef: RefObject<HTMLDivElement>;
  /** On `.wb-body`: the row the side panes and the editor share. */
  bodyRef: RefObject<HTMLDivElement>;
  /** The width each side pane renders (or reopens) at. */
  sidebarWidth: number;
  boardWidth: number;
  consoleHeight: number;
  collapsed: SidePaneFlags;
  /** Opens a shut pane or shuts an open one, with a slide. */
  togglePane: (pane: SidePane) => void;
  /** Opens or shuts a pane, with a slide; nothing when it already is. */
  showPane: (pane: SidePane, open: boolean) => void;
  onSidebarDividerPointerDown: DividerPointerDown;
  onBoardDividerPointerDown: DividerPointerDown;
  onConsoleDividerPointerDown: DividerPointerDown;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const otherPane = (pane: SidePane): SidePane => (pane === 'sidebar' ? 'board' : 'sidebar');

export function usePaneLayout(): PaneLayoutState {
  const wbRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Both side panes are user-driven (drag) but always reconciled against
  // the body's actual measured width, so neither can push the other pane —
  // or itself — past the browser edge. `desiredWidth` holds the user's last
  // requested width for each, independent of whatever it was actually
  // rendered at after the reconciliation; that's what lets a pane grow back
  // to what the user asked for once the other one is dragged back or the
  // window regains room, instead of staying stuck at a once-clamped size.
  //
  // Everything starts from wherever it was last left (paneLayout.ts), and is
  // stored again at the end of every drag and every open or close — except
  // that the Board I/O pane always starts open: the board is what the app is
  // for, and a board shut in an earlier session looks like a broken page.
  const [initialLayout] = useState(() => ({
    ...loadPaneLayout({
      sidebarWidth: SIDEBAR_DEFAULT_W,
      boardWidth: BOARD_DEFAULT_W,
      consoleHeight: CONSOLE_DEFAULT_H,
      sidebarCollapsed: false,
      boardCollapsed: false,
    }),
    boardCollapsed: false,
  }));
  const desiredWidth = useRef<Record<SidePane, number>>({
    sidebar: initialLayout.sidebarWidth,
    board: initialLayout.boardWidth,
  });
  const [sidebarWidth, setSidebarWidth] = useState(initialLayout.sidebarWidth);
  const [boardWidth, setBoardWidth] = useState(initialLayout.boardWidth);

  // Either side pane can be shut — from its header, its rail, a shortcut, or
  // by dragging its divider most of the way to the window edge.
  // `collapsedRef` mirrors the state for the layout code, which runs from a
  // ResizeObserver and mid-drag, both outside React's render.
  const [collapsed, setCollapsedState] = useState<SidePaneFlags>({
    sidebar: initialLayout.sidebarCollapsed,
    board: initialLayout.boardCollapsed,
  });
  const collapsedRef = useRef(collapsed);
  const setPaneCollapsed = (pane: SidePane, shut: boolean) => {
    const next = { ...collapsedRef.current, [pane]: shut };
    collapsedRef.current = next;
    setCollapsedState(next);
  };

  // The console's height, reconciled the same way against the page's height:
  // `desiredConsoleHeight` is what the last drag left it at, `consoleHeight`
  // what currently fits.
  const desiredConsoleHeight = useRef(initialLayout.consoleHeight);
  const [consoleHeight, setConsoleHeight] = useState(initialLayout.consoleHeight);

  const storeLayout = () =>
    savePaneLayout({
      sidebarWidth: desiredWidth.current.sidebar,
      boardWidth: desiredWidth.current.board,
      consoleHeight: desiredConsoleHeight.current,
      sidebarCollapsed: collapsedRef.current.sidebar,
      boardCollapsed: collapsedRef.current.board,
    });

  const bodyWidth = () => bodyRef.current?.getBoundingClientRect().width ?? 0;

  // Fits both side panes into a body `containerWidth` wide from the desired
  // widths and the collapsed flags (fitSidePanes also explains `shrinkFirst`).
  const applyLayout = useCallback((containerWidth: number, shrinkFirst: ShrinkFirst = 'proportional') => {
    if (containerWidth <= 0) return;
    const fitted = fitSidePanes(containerWidth, desiredWidth.current, collapsedRef.current, shrinkFirst);
    setSidebarWidth(fitted.sidebar);
    setBoardWidth(fitted.board);
  }, []);

  // True for the length of a pane's slide (togglePane), while its rail is
  // still sliding in or out and .wb-body's width with it.
  const sliding = useRef(false);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      // Mid-slide, togglePane has already laid the panes out for where the
      // slide ends, and fits them again once it has.
      if (sliding.current) return;
      const width = entries[0]?.contentRect.width;
      if (width) applyLayout(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [applyLayout]);

  // Clamps a requested console height between its own minimum and whatever
  // the panes above leave, and returns what it applied. The header's height
  // is measured (the gap between .wb's top and .wb-body's), not duplicated
  // from Workbench.css.
  const applyConsoleHeight = useCallback((desired: number): number => {
    const wb = wbRef.current;
    const body = bodyRef.current;
    if (!wb || !body) return desired;
    const headerH = body.getBoundingClientRect().top - wb.getBoundingClientRect().top;
    const room = wb.clientHeight - headerH - ROW_DIVIDER_H;
    const next = clamp(desired, CONSOLE_MIN_H, Math.max(CONSOLE_MIN_H, room - BODY_MIN_H));
    setConsoleHeight(next);
    return next;
  }, []);

  // Only .wb's own height matters here; the console's height moves space
  // between .wb-body and the console, never .wb itself, so this can't loop.
  useEffect(() => {
    const el = wbRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => applyConsoleHeight(desiredConsoleHeight.current));
    observer.observe(el);
    return () => observer.disconnect();
  }, [applyConsoleHeight]);

  // Pointer capture keeps the whole drag bound to the handle: without it the
  // cursor reverts to whatever the pointer happens to be over mid-drag (the
  // editor's text I-beam, most obviously), which reads as the drag having
  // dropped. `.wb-is-resizing-x` / `-y` holds the resize cursor and
  // suppresses text selection across the page for the same reason, and
  // `.is-dragging` keeps the handle highlighted even when the pointer
  // outruns it.
  const beginResize = (
    e: ReactPointerEvent<HTMLDivElement>,
    axis: ResizeAxis,
    onDelta: (delta: number) => void,
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const start = axis === 'x' ? e.clientX : e.clientY;
    const handle = e.currentTarget;
    const bodyClass = `wb-is-resizing-${axis}`;
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('is-dragging');
    document.body.classList.add(bodyClass);

    const onMove = (ev: PointerEvent) => {
      onDelta((axis === 'x' ? ev.clientX : ev.clientY) - start);
    };
    const onUp = () => {
      storeLayout();
      document.body.classList.remove(bodyClass);
      handle.classList.remove('is-dragging');
      handle.releasePointerCapture(e.pointerId);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };

  // Dragging a divider resizes its pane; dragged past half the pane's
  // minimum the pane snaps shut, and dragged back out it opens again, all
  // within the one drag. A shut pane starts the drag at zero width, so its
  // divider pulls it back open. A pane snapped shut keeps the width it had
  // before the drag to reopen at, not the sliver it was dragged down to.
  //
  // The width is measured from the pane's outer edge — .wb-body's own edge on
  // that side — which is not fixed for the whole drag: shutting or opening
  // the pane mid-drag shows or hides its rail, and that moves the edge (and
  // .wb-body's width) by the rail's width. The shift is worked out from the
  // collapsed flag rather than measured, since the next pointer move can
  // arrive before React has rendered the rail's change. `grab` keeps the
  // pointer where it took hold of the divider.
  const resizePane = (e: ReactPointerEvent<HTMLDivElement>, pane: SidePane) => {
    const body = bodyRef.current;
    if (!body) return;
    const minWidth = pane === 'sidebar' ? SIDEBAR_MIN_W : BOARD_MIN_W;
    const openWidth = pane === 'sidebar' ? sidebarWidth : boardWidth;
    const startCollapsed = collapsedRef.current[pane];
    const startWidth = startCollapsed ? 0 : openWidth;
    const widthBeforeDrag = desiredWidth.current[pane];
    const start = body.getBoundingClientRect();
    const widthFromStartEdge = (pointerX: number) =>
      pane === 'sidebar' ? pointerX - start.left : start.right - pointerX;
    const railShift = () => {
      if (collapsedRef.current[pane] === startCollapsed) return 0;
      return startCollapsed ? RAIL_W : -RAIL_W;
    };
    const startX = e.clientX;
    const grab = widthFromStartEdge(startX) - startWidth;
    beginResize(e, 'x', (deltaX) => {
      const measured = widthFromStartEdge(startX + deltaX) - grab;
      const shut = collapsesAt(measured + railShift(), minWidth);
      if (shut !== collapsedRef.current[pane]) setPaneCollapsed(pane, shut);
      desiredWidth.current[pane] = shut ? widthBeforeDrag : measured + railShift();
      applyLayout(start.width + railShift(), otherPane(pane));
    });
  };

  // This handle sits on the console's top edge, so dragging it up (negative
  // clientY delta) grows the console. The clamped height is what's
  // remembered — unlike the side panes there is no other pane to give way,
  // so an over-drag has nothing to grow back into later.
  const resizeConsole = (e: ReactPointerEvent<HTMLDivElement>) => {
    const startHeight = consoleHeight;
    beginResize(e, 'y', (deltaY) => {
      desiredConsoleHeight.current = applyConsoleHeight(startHeight - deltaY);
    });
  };

  // Keyboard focus moves to whichever control takes over from the one about
  // to be hidden: from a shutting pane to its rail's Show button, and from a
  // rail that goes as its pane opens to the pane's Hide button. Focus
  // anywhere else (the editor, for a shortcut) stays where it is. The move
  // waits for the commit below, once the new control is visible.
  const focusAfterToggle = useRef<string | null>(null);
  const handOffFocus = (pane: SidePane, opening: boolean) => {
    const ids = PANE_IDS[pane];
    const going = document.getElementById(opening ? ids.rail : ids.pane);
    if (going?.contains(document.activeElement)) focusAfterToggle.current = opening ? ids.hide : ids.show;
  };
  useEffect(() => {
    const id = focusAfterToggle.current;
    focusAfterToggle.current = null;
    if (id) document.getElementById(id)?.focus();
  }, [collapsed]);

  // Opening or shutting a pane from a button or a shortcut slides it, and its
  // rail the other way: widths only animate while .wb has .is-sliding
  // (SidePanel.css, ActivityBar.css), so a drag or a window resize never lags
  // behind. The panes are laid out at once for the room .wb-body will have
  // once the rail has come or gone, and fitted again to the measured room at
  // the end. An opening pane keeps its own width and the other one gives way,
  // as in a drag.
  const slideTimer = useRef<number | null>(null);
  const togglePane = (pane: SidePane) => {
    const opening = collapsedRef.current[pane];
    const shrinkFirst = otherPane(pane);
    handOffFocus(pane, opening);
    const wb = wbRef.current;
    if (wb) {
      sliding.current = true;
      wb.classList.add('is-sliding');
      if (slideTimer.current !== null) window.clearTimeout(slideTimer.current);
      slideTimer.current = window.setTimeout(() => {
        wb.classList.remove('is-sliding');
        sliding.current = false;
        slideTimer.current = null;
        applyLayout(bodyWidth(), shrinkFirst);
      }, SLIDE_MS);
    }
    setPaneCollapsed(pane, !opening);
    applyLayout(bodyWidth() + (opening ? RAIL_W : -RAIL_W), shrinkFirst);
    storeLayout();
  };

  const showPane = (pane: SidePane, open: boolean) => {
    if (collapsedRef.current[pane] === open) togglePane(pane);
  };

  useEffect(
    () => () => {
      if (slideTimer.current !== null) window.clearTimeout(slideTimer.current);
    },
    [],
  );

  // Ctrl+B shows or hides the Explorer and Ctrl+Alt+B the board — the keys
  // an IDE uses for its primary and secondary side bars. Matched on `code`,
  // the physical B key, so it works on every keyboard layout; AltGr, which
  // Windows reports as Ctrl+Alt, is told apart by its own modifier state.
  // The listener is attached once and reads togglePane through a ref.
  const togglePaneRef = useRef(togglePane);
  togglePaneRef.current = togglePane;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.code !== 'KeyB') return;
      if (e.getModifierState('AltGraph')) return;
      e.preventDefault();
      if (!e.repeat) togglePaneRef.current(e.altKey ? 'board' : 'sidebar');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return {
    wbRef,
    bodyRef,
    sidebarWidth,
    boardWidth,
    consoleHeight,
    collapsed,
    togglePane,
    showPane,
    onSidebarDividerPointerDown: (e) => resizePane(e, 'sidebar'),
    onBoardDividerPointerDown: (e) => resizePane(e, 'board'),
    onConsoleDividerPointerDown: resizeConsole,
  };
}
