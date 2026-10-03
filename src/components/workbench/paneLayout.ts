// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/* ------------------------------------------------------------------ *
 * The Workbench's pane geometry: how the two side panes share the row
 * with the editor (fitSidePanes), when a dragged divider snaps a pane
 * shut (collapsesAt), and where the dividers were last left — kept in
 * localStorage so the app reopens looking the way it was closed. The
 * desktop app always serves the page from the same origin
 * (http://127.0.0.1:9010), so its storage survives restarts; in a browser
 * it is simply per-site. The stored sizes are the *requested* ones — the
 * Workbench still clamps them to whatever the window allows.
 * ------------------------------------------------------------------ */

// The space each pane needs to stay usable, and the width each starts at —
// see the "Resizing" note in this folder's README before changing these.
// These are *rendered* widths: both side panes are border-box, so the width
// set here is the width measured on screen, padding included.
//
// There is deliberately no maximum for either side pane. A fixed ceiling is
// what stops a divider being dragged back to where it sat before the window
// grew: widen the window and the pane stays pinned at its cap while the
// editor swallows the new space, so the divider can never travel back. Each
// pane's real ceiling is whatever the other two panes' minimums leave, which
// fitSidePanes works out per call.
export const SIDEBAR_MIN_W = 208;
export const SIDEBAR_DEFAULT_W = 278;
export const EDITOR_MIN_W = 200;
export const BOARD_MIN_W = 200;
export const BOARD_DEFAULT_W = 792;
// The two vertical .wb-resizer handles, which sit between the panes and take
// width of their own (Workbench.css keeps them at 5px each). They stay put
// when a pane is collapsed, so a collapsed pane can be dragged back out.
export const CHROME_W = 10;

export type SidePane = 'sidebar' | 'board';

export interface SidePaneWidths {
  sidebar: number;
  board: number;
}

export type SidePaneFlags = Record<SidePane, boolean>;

/**
 * Which pane gives way when both requested widths don't fit alongside the
 * editor's minimum:
 * - 'sidebar' / 'board': that pane gives way first — during a drag, the one
 *   *not* being dragged, so the one the user is resizing tracks the pointer.
 * - 'proportional' (a plain window resize, no active drag): both give way
 *   together, in proportion to how much each has left above its own
 *   minimum. Giving one pane strict priority here left the other looking
 *   frozen across a wide range of window widths.
 */
export type ShrinkFirst = SidePane | 'proportional';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * The widths the two side panes render at in a row `containerWidth` wide.
 * A collapsed pane takes no room, so the open one may grow into it; its own
 * returned width is the one it reopens at (re-fitted again when it does).
 */
export function fitSidePanes(
  containerWidth: number,
  desired: SidePaneWidths,
  collapsed: SidePaneFlags,
  shrinkFirst: ShrinkFirst = 'proportional',
): SidePaneWidths {
  // What is left for the three panes once the drag handles take theirs.
  const room = containerWidth - CHROME_W;
  // Each pane may claim anything the other two don't need, so a pane can
  // always be dragged back out to where the window allows.
  const sidebarNeeds = collapsed.sidebar ? 0 : SIDEBAR_MIN_W;
  const boardNeeds = collapsed.board ? 0 : BOARD_MIN_W;
  const sidebarMax = Math.max(SIDEBAR_MIN_W, room - boardNeeds - EDITOR_MIN_W);
  const boardMax = Math.max(BOARD_MIN_W, room - sidebarNeeds - EDITOR_MIN_W);
  let sidebar = clamp(desired.sidebar, SIDEBAR_MIN_W, sidebarMax);
  let board = clamp(desired.board, BOARD_MIN_W, boardMax);

  // With either pane collapsed the clamps above already fit the open one.
  if (collapsed.sidebar || collapsed.board) return { sidebar, board };

  const overflow = sidebar + board + EDITOR_MIN_W - room;
  if (overflow > 0) {
    if (shrinkFirst === 'proportional') {
      const sidebarRoom = sidebar - SIDEBAR_MIN_W;
      const boardRoom = board - BOARD_MIN_W;
      const totalRoom = sidebarRoom + boardRoom;
      if (totalRoom > 0) {
        const sidebarShrink = Math.min(sidebarRoom, (overflow * sidebarRoom) / totalRoom);
        sidebar -= sidebarShrink;
        board -= Math.min(boardRoom, overflow - sidebarShrink);
      }
    } else {
      const shrinkSidebarFirst = shrinkFirst === 'sidebar';
      const first = shrinkSidebarFirst
        ? Math.min(overflow, sidebar - SIDEBAR_MIN_W)
        : Math.min(overflow, board - BOARD_MIN_W);
      if (shrinkSidebarFirst) sidebar -= first;
      else board -= first;

      const remaining = overflow - first;
      if (remaining > 0) {
        // Still too tight even at the other pane's minimum — take the
        // rest from whichever pane wasn't shrunk first.
        if (shrinkSidebarFirst) board = Math.max(BOARD_MIN_W, board - remaining);
        else sidebar = Math.max(SIDEBAR_MIN_W, sidebar - remaining);
      }
    }
  }
  return { sidebar, board };
}

/**
 * A divider dragged until its pane would be `width` wide: under half the
 * pane's minimum the pane snaps shut instead, and dragging back past the
 * same point opens it again — the way an IDE's side bars behave.
 */
export const collapsesAt = (width: number, minWidth: number): boolean => width < minWidth / 2;

export interface PaneLayout {
  sidebarWidth: number;
  boardWidth: number;
  consoleHeight: number;
  sidebarCollapsed: boolean;
  boardCollapsed: boolean;
}

const STORAGE_KEY = 'hdlboard.paneLayout.v1';

const isSize = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const isFlag = (value: unknown): value is boolean => typeof value === 'boolean';

/**
 * Anything missing or malformed falls back to the matching default — which
 * is also how a layout stored before panes could collapse reads back.
 */
export function parsePaneLayout(json: string | null, defaults: PaneLayout): PaneLayout {
  try {
    const raw: unknown = JSON.parse(json ?? 'null');
    if (!raw || typeof raw !== 'object') return defaults;
    const r = raw as Record<string, unknown>;
    return {
      sidebarWidth: isSize(r.sidebarWidth) ? r.sidebarWidth : defaults.sidebarWidth,
      boardWidth: isSize(r.boardWidth) ? r.boardWidth : defaults.boardWidth,
      consoleHeight: isSize(r.consoleHeight) ? r.consoleHeight : defaults.consoleHeight,
      sidebarCollapsed: isFlag(r.sidebarCollapsed) ? r.sidebarCollapsed : defaults.sidebarCollapsed,
      boardCollapsed: isFlag(r.boardCollapsed) ? r.boardCollapsed : defaults.boardCollapsed,
    };
  } catch {
    return defaults;
  }
}

export function loadPaneLayout(defaults: PaneLayout): PaneLayout {
  try {
    return parsePaneLayout(window.localStorage.getItem(STORAGE_KEY), defaults);
  } catch {
    // Storage blocked: start from the defaults.
    return defaults;
  }
}

export function savePaneLayout(layout: PaneLayout): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Storage blocked or full: the layout just isn't remembered.
  }
}
