// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Which editor tab shows the play/stop icon (`SimToggle`), and which of the two.
 * Pure — no React, no state — so the rules are unit-tested: while a simulation
 * compiles or runs, only the file it runs gets an icon, Stop, whichever tab is
 * active, and no tab offers Play; while nothing runs, the active tab gets Play
 * if its file could be top.
 */

import { hasTopDot } from './fileKinds';
import type { VhdlFile } from './files';
import type { SimStatus } from './SimulationCard';

export interface RunIcon {
  tabId: string;
  kind: 'play' | 'stop';
}

export function runIconFor(
  status: SimStatus,
  runFileId: string | null,
  activeFile: Pick<VhdlFile, 'id' | 'folder'> | undefined,
): RunIcon | null {
  if (status !== 'stopped') return runFileId === null ? null : { tabId: runFileId, kind: 'stop' };
  if (activeFile && hasTopDot(activeFile.folder)) return { tabId: activeFile.id, kind: 'play' };
  return null;
}
