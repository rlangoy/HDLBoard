// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Which view the editor column shows, and what a run runs
 * (docs/impl_split_screen.md § 1.1, § 4.2, § 4.10, § 6.3, § 6.6). Pure — the
 * Workbench calls these on pair-change events only (D7), never while typing.
 */

import { unitKey } from './tbDetect/analyzeProject';
import type { EditorPair, FileAnalysis, PaneTarget } from './tbDetect/types';

export type SplitPreference = 'auto' | 'always' | 'never';
export type EditorView = 'tb' | 'both' | 'rtl';
export type PairEvent = 'open' | 'run';
export type PaneRole = 'tb' | 'rtl';

/** In a column too narrow for two panes, Both shows the focused pane only (§ 4.9). */
export const narrowView = (view: EditorView, focusedPane: PaneRole, canSplit: boolean): EditorView =>
  view === 'both' && !canSplit ? focusedPane : view;

export function pairKey(pair: EditorPair): string {
  return `${pair.tb?.fileId ?? '-'}|${pair.rtl?.fileId ?? '-'}`;
}

/** 'tb' when the anchor is the TB side alone; in a single-file pair, or on a design, 'rtl'. */
export function anchorRoleView(pair: EditorPair): PaneRole {
  const isTb = pair.tb?.fileId === pair.anchorId;
  const isRtl = pair.rtl?.fileId === pair.anchorId;
  return isTb && !isRtl ? 'tb' : 'rtl';
}

export function resolveView(
  pair: EditorPair,
  preference: SplitPreference,
  pinned: EditorView | undefined,
  event: PairEvent,
): EditorView {
  const anchorView = anchorRoleView(pair);
  // A pin wins (B6), except that it never hides the file being opened: a pair pinned to
  // its design, opened from its testbench, shows the testbench.
  const pinHidesAnchor = pinned !== undefined && pinned !== 'both' && pair[pinned]?.fileId !== pair.anchorId;
  if (pinned) return pinHidesAnchor ? anchorView : pinned;
  if (preference === 'never') return anchorView;
  // Always splits whenever there is a testbench, however weak; a design without one keeps a single pane.
  if (preference === 'always') return pair.tb ? 'both' : anchorView;
  const enough = event === 'run' ? pair.tbConfidence !== 'low' : pair.tbConfidence === 'high';
  return pair.tb && enough ? 'both' : anchorView; // B1, B2: the design side never decides
}

/**
 * § 4.7: the chip shows in Automatic, unpinned, with the split closed, when the
 * pair has a testbench the layout did not open for — weak evidence only, or
 * strong evidence typed since the last pair change.
 */
export function showsSuggestion(
  pair: EditorPair,
  preference: SplitPreference,
  pinned: EditorView | undefined,
  view: EditorView,
  dismissed: boolean,
): boolean {
  if (preference !== 'auto' || pinned || dismissed || view === 'both') return false;
  return pair.tb !== null && pair.tbConfidence !== 'low';
}

/** The unit a pane runs, when the backend has to be told: a TB pane, or a file of more than one unit (B7). */
export function runTargetFor(target: PaneTarget, file: FileAnalysis | undefined, pane: PaneRole): string | null {
  if (target.unitName === null) return null;
  return pane === 'tb' || (file?.units.length ?? 0) > 1 ? target.unitName : null;
}

export interface RunRoute {
  readonly unitName: string | null;
  readonly pane: PaneRole;
  readonly runTarget: string | null;
}

/**
 * B4 / D24: which unit a Start or tab Play runs, and which pane gets focus.
 * topUnit still declared in the file -> that unit; else the first testbench unit;
 * else the first design unit. runTarget is null when the file declares one unit.
 */
export function routeRun(file: FileAnalysis | undefined, topUnit: string | null): RunRoute {
  const units = file?.units ?? [];
  const key = (name: string) => (file ? unitKey(file.language, name) : name);
  const remembered = topUnit === null ? undefined : units.find((u) => key(u.name) === key(topUnit));
  const unit = remembered ?? units.find((u) => u.role === 'tb') ?? units[0];
  if (!unit) return { unitName: null, pane: 'rtl', runTarget: null };
  return { unitName: unit.name, pane: unit.role, runTarget: units.length > 1 ? unit.name : null };
}

/** Which pane shows `fileId` in `pair`, preferring the pane whose unit is `unitName` in a self pair. */
export function paneOf(pair: EditorPair, fileId: string, unitName?: string | null): PaneRole {
  const inTb = pair.tb?.fileId === fileId;
  const inRtl = pair.rtl?.fileId === fileId;
  if (inTb && inRtl) return unitName && pair.tb?.unitName === unitName ? 'tb' : 'rtl';
  return inTb ? 'tb' : 'rtl';
}
