// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/* ------------------------------------------------------------------ *
 * The desktop app's bridge, `window.hdlboard` (winInstaller/electron/
 * preload.js). In a browser it does not exist and nothing here does
 * anything. The storage itself lives entirely in the Electron main
 * process; the renderer only feature-detects it and hands over JSON.
 * ------------------------------------------------------------------ */

import type { VhdlFile } from './files';

export interface HdlBoardBridge {
  /** Whether project storage is on for this launch. */
  readonly enabled: boolean;
  /** Takes effect after a restart. */
  setEnabled(enabled: boolean): Promise<boolean>;
  /** Present only while storage is enabled — feature-detect on these. */
  saveWorkspace?(json: string): Promise<boolean>;
  loadWorkspace?(): Promise<string | null>;
}

declare global {
  interface Window {
    hdlboard?: HdlBoardBridge;
  }
}

export function desktopBridge(): HdlBoardBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.hdlboard;
}

/** What is stored: the Files panel and the editor's tabs, nothing else. */
export interface Workspace {
  files: VhdlFile[];
  openTabs: string[];
  activeTabId: string | null;
  topFileId: string | null;
}

const WORKSPACE_VERSION = 1;
const FOLDERS: readonly VhdlFile['folder'][] = ['vhdl', 'verilog', 'work'];

export function serializeWorkspace(ws: Workspace): string {
  return JSON.stringify({ version: WORKSPACE_VERSION, ...ws });
}

function isFile(value: unknown): value is VhdlFile {
  if (!value || typeof value !== 'object') return false;
  const f = value as Record<string, unknown>;
  return (
    typeof f.id === 'string' &&
    typeof f.name === 'string' &&
    typeof f.content === 'string' &&
    FOLDERS.includes(f.folder as VhdlFile['folder'])
  );
}

/**
 * Anything that does not look like a workspace we wrote comes back as
 * `undefined`, so the caller falls back to the starter project instead of
 * opening a broken one. Tab and top-file references to files that are not
 * there are dropped rather than trusted.
 */
export function parseWorkspace(json: string | null | undefined): Workspace | undefined {
  if (!json) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (r.version !== WORKSPACE_VERSION || !Array.isArray(r.files)) return undefined;

  const seen = new Set<string>();
  const files = r.files.filter(isFile).filter((f) => !seen.has(f.id) && seen.add(f.id));
  const ids = new Set(files.map((f) => f.id));
  const known = (id: unknown): id is string => typeof id === 'string' && ids.has(id);

  const openTabs = Array.isArray(r.openTabs) ? [...new Set(r.openTabs.filter(known))] : [];
  const activeTabId = known(r.activeTabId) && openTabs.includes(r.activeTabId) ? r.activeTabId : openTabs[0] ?? null;
  const topFileId = known(r.topFileId) ? r.topFileId : null;
  return {
    files: files.map(({ id, name, folder, content }) => ({ id, name, folder, content })),
    openTabs,
    activeTabId,
    topFileId,
  };
}
