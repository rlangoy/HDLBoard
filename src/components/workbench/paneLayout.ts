// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/* ------------------------------------------------------------------ *
 * Where the Workbench's three dividers were last left, kept in
 * localStorage so the app reopens looking the way it was closed. The
 * desktop app always serves the page from the same origin
 * (http://127.0.0.1:9010), so its storage survives restarts; in a browser
 * it is simply per-site. These are the *requested* sizes — the Workbench
 * still clamps them to whatever the window allows.
 * ------------------------------------------------------------------ */

export interface PaneLayout {
  sidebarWidth: number;
  boardWidth: number;
  consoleHeight: number;
}

const STORAGE_KEY = 'hdlboard.paneLayout.v1';

const isSize = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Anything missing or malformed falls back to the matching default. */
export function loadPaneLayout(defaults: PaneLayout): PaneLayout {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return defaults;
    const r = raw as Record<string, unknown>;
    return {
      sidebarWidth: isSize(r.sidebarWidth) ? r.sidebarWidth : defaults.sidebarWidth,
      boardWidth: isSize(r.boardWidth) ? r.boardWidth : defaults.boardWidth,
      consoleHeight: isSize(r.consoleHeight) ? r.consoleHeight : defaults.consoleHeight,
    };
  } catch {
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
