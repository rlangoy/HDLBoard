// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/* ------------------------------------------------------------------ *
 * The desktop app's bridge, `window.hdlboard` (winInstaller/electron/
 * preload.js). In a browser it does not exist and nothing here does
 * anything. The storage itself lives entirely in the Electron main
 * process; the renderer only feature-detects it and hands over JSON.
 * ------------------------------------------------------------------ */

import { FOLDER_ORDER, filesInFolderOrder } from './fileKinds';
import type { VhdlFile } from './files';
import { parseStoredProject, type OpenProject } from './projectFile';
import type { TestbenchOverrides, UnitRole } from './tbDetect/types';

export interface HdlBoardBridge {
  /** Whether project storage is on for this launch. */
  readonly enabled: boolean;
  /** Takes effect after a restart. */
  setEnabled(enabled: boolean): Promise<boolean>;
  /** Present only while storage is enabled — feature-detect on these. */
  saveWorkspace?(json: string): Promise<boolean>;
  loadWorkspace?(): Promise<string | null>;
  /** Reads a project file, or a source file next to it, by its full path (Open Project, docs/PROJECTS.md). */
  readLocalFile?(path: string): Promise<string>;
  /** Writes one, by its full path (Save project into the folder a project was opened from). */
  writeLocalFile?(path: string, text: string): Promise<boolean>;
}

declare global {
  interface Window {
    hdlboard?: HdlBoardBridge;
  }
}

export function desktopBridge(): HdlBoardBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.hdlboard;
}

/** What is stored: the project's files and which one is shown, nothing else. */
export interface Workspace {
  files: VhdlFile[];
  /** The file in the editor's focused pane (docs/cleanup_file_tabs.md D10). */
  activeFileId: string | null;
  topFileId: string | null;
  /** The top file's unit a pane's Play chose (`RUN <file> @<unit>`); kept only with `topFileId`. */
  topUnit?: string | null;
  /** Role and pair overrides (docs/impl_split_screen.md § 6.7); missing reads as none. */
  testbench?: TestbenchOverrides;
  /** The open project file (projectFile.ts); missing or null reads as none. */
  project?: OpenProject | null;
}

const WORKSPACE_VERSION = 1;

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
    FOLDER_ORDER.includes(f.folder as VhdlFile['folder'])
  );
}

/**
 * Anything that does not look like a workspace we wrote comes back as
 * `undefined`, so the caller falls back to the starter project instead of
 * opening a broken one. Shown-file and top-file references to files that are not
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

  // Up to 1.3.0 the shown file was the active tab, `activeTabId`; the tabs, `openTabs`, are gone.
  const activeFileId = [r.activeFileId, r.activeTabId].find(known) ?? filesInFolderOrder(files)[0]?.id ?? null;
  const topFileId = known(r.topFileId) ? r.topFileId : null;
  const topUnit = topFileId !== null && typeof r.topUnit === 'string' ? r.topUnit : null;
  return {
    files: files.map(({ id, name, folder, content }) => ({ id, name, folder, content })),
    activeFileId,
    topFileId,
    topUnit,
    testbench: parseOverrides(r.testbench, known),
    project: parseStoredProject(r.project),
  };
}

const ROLES: readonly UnitRole[] = ['tb', 'rtl'];

/** Overrides naming files that are not there are dropped, like a missing shown file is. */
function parseOverrides(raw: unknown, known: (id: unknown) => id is string): TestbenchOverrides {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const entries = (value: unknown) => (value && typeof value === 'object' ? Object.entries(value) : []);
  const roles = entries(r.roles).filter(([id, role]) => known(id) && ROLES.includes(role as UnitRole));
  const pairs = entries(r.pairs).filter(([design, tb]) => known(design) && known(tb));
  return { roles: Object.fromEntries(roles), pairs: Object.fromEntries(pairs) };
}
