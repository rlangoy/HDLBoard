// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The run control in a pane's header (`SimToggle`): Play, Stop, or Play greyed
 * out while another run goes (docs/cleanup_file_tabs.md D8;
 * docs/impl_split_screen.md B5). Pure — no React, no state — so the rules are
 * unit-tested.
 */

import { hasTopDot, type Folder } from './fileKinds';
import type { SimStatus } from './SimulationCard';
import type { PaneRole } from './editorView';
import type { PaneTarget } from './tbDetect/types';

/** `blocked`: Play, greyed out, because something else is simulating. */
export type PaneRunKind = 'play' | 'stop' | 'blocked';

export interface PaneRunInput {
  readonly status: SimStatus;
  /** The file the current (or last) run started from. */
  readonly runFileId: string | null;
  /** …and the unit it runs, when one was named. */
  readonly runUnitName: string | null;
  readonly target: PaneTarget;
  readonly folder: Folder;
  readonly pane: PaneRole;
}

/** What the pane shows, or `null` for no control: a file that cannot be run from this pane. */
export function paneRunFor(input: PaneRunInput): PaneRunKind | null {
  if (input.status === 'stopped') return canRunFrom(input) ? 'play' : null;
  if (runsThisPane(input)) return 'stop';
  return canRunFrom(input) ? 'blocked' : null;
}

/** A `work/` testbench has no top dot, but its TB pane can run it (impl_split_screen.md D21). */
function canRunFrom({ folder, pane }: PaneRunInput): boolean {
  return hasTopDot(folder) || pane === 'tb';
}

/** Only the pane showing the running unit offers Stop (B5); a run that named no unit stops from any of its file's panes. */
function runsThisPane({ runFileId, runUnitName, target }: PaneRunInput): boolean {
  if (runFileId !== target.fileId) return false;
  if (runUnitName === null || target.unitName === null) return true;
  return runUnitName.toLowerCase() === target.unitName.toLowerCase();
}
