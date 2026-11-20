// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdvisedDiagnostic } from '../diagnosticAdvice';
import type { DesignCheckBadge } from '../EditorPaneHeader';
import type { TestbenchOverrides } from '../tbDetect/types';
import { DESIGN_CHECKS } from './designCheck';
import { checkDiagnostics } from './findingDiagnostics';
import { NO_QUIET_WARNINGS, onlyFiles, quietFile, showFile, showLine, withQuieted, type QuietWarnings } from './quietWarnings';
import { isSimModel } from './simModels';
import { driverSummaries, groupChanges, simOnlyBadgeText, simOnlySummaries, type SummaryLine } from './simOnlyReport';
import { shownFindings, withToolFindings } from './toolCheck/toolFindings';
import type { DesignCheck, DesignCheckMode, DesignView, FileGroup, SimulatorClock, ToolFinding } from './types';

const NO_TOOL_FINDINGS: readonly ToolFinding[] = [];

export interface DesignCheckOptions {
  /** `TestbenchSplit.designView`: recomputed with the detector, 500 ms after typing stops. */
  readonly view: DesignView;
  readonly overrides: TestbenchOverrides;
  readonly mode: DesignCheckMode;
  /** The files as the editor has them now. */
  readonly files: readonly { readonly id: string; readonly name: string; readonly content: string }[];
  readonly setSimModel: (fileId: string, simModel: boolean) => void;
  /** The active board's simulator-only clock (CheckInput); memoised. */
  readonly simulatorClock?: SimulatorClock;
  /** The project as it is now, not 500 ms ago (`TestbenchSplit.designViewNow`): for the console at Start. */
  readonly viewNow: () => { readonly view: DesignView; readonly overrides: TestbenchOverrides };
  /**
   * The synthesis check's findings while its answer fits the code (`useToolCheck`, § 7), and
   * that answer itself: when it goes stale, the change of group it causes is not news.
   */
  readonly tool?: { readonly findings: readonly ToolFinding[]; readonly applied: object | null };
}

export interface DesignCheckApi {
  readonly check: DesignCheck;
  /** The live warnings, to merge with a run's diagnostics (`addToFiles`); those dismissed are quiet. */
  readonly diagnostics: readonly AdvisedDiagnostic[];
  /** A click in the editor: the file's live warnings lose their text after the line, and keep the gutter's `!`. */
  readonly quietFile: (fileId: string) => void;
  /** A console link to the file: its live warnings show again. */
  readonly showFile: (fileId: string) => void;
  /** A click on a line number or its `!`: the line's live warnings show again. */
  readonly showLine: (fileId: string, line: number) => void;
  /** A file's group for the Files panel; undefined for a file with no design unit. */
  readonly groupOf: (fileId: string) => FileGroup | undefined;
  /** A design pane's badge; undefined with the check off (*Simulation only*). */
  readonly badgeFor: (fileId: string) => DesignCheckBadge | undefined;
  /**
   * The console lines at Start for the files that run: one per SIM-only file, one per signal
   * with more than one driver, from the code as it is now.
   */
  readonly summariesFor: (runFileIds: ReadonlySet<string>) => SummaryLine[];
  /** For a polite live region: the last change of a file between RTL and SIM-only. */
  readonly announcement: string;
}

/**
 * The design check of docs/impl_sim_only_warnings.md, for the Workbench. The live check runs
 * only when the detector's analysis, the overrides or the mode change, never per
 * keystroke; per keystroke only the line counts are compared (findingDiagnostics.ts). At
 * Start, `summariesFor` runs it once more on the code as it is then.
 */
export function useDesignCheck(options: DesignCheckOptions): DesignCheckApi {
  const { view, overrides, mode, files, setSimModel, simulatorClock } = options;
  const toolFindings = options.tool?.findings ?? NO_TOOL_FINDINGS;
  const check = useMemo(() => DESIGN_CHECKS[mode]({ view, overrides, simulatorClock, toolFindings }), [view, overrides, mode, simulatorClock, toolFindings]);
  // The tool's findings, one message per line with the live ones (toolFindings.ts); none in *Simulation only*.
  const loud = useMemo(() => {
    const live = checkDiagnostics(check, { analysis: view.raw, overrides, files });
    return mode === 'synthesis' ? withToolFindings(live, shownFindings(toolFindings, view, overrides)) : live;
  }, [check, view, overrides, files, mode, toolFindings]);
  const [quieted, setQuieted] = useState<QuietWarnings>(NO_QUIET_WARNINGS);
  // A dismissed warning is known by its line's code (quietWarnings.ts), as the editor has it now.
  const lineText = useMemo(() => lineTextOf(files), [files]);
  const warned = useMemo(() => ({ warnings: loud, lineText }), [loud, lineText]);
  const diagnostics = useMemo(() => withQuieted(warned, quieted), [warned, quieted]);
  useForgetDeletedFiles(files, setQuieted);
  const warnedRef = useRef(warned);
  warnedRef.current = warned;
  const quietWarningsOf = useCallback((fileId: string) => setQuieted((prev) => quietFile(prev, warnedRef.current, fileId)), []);
  const showWarningsOf = useCallback((fileId: string) => setQuieted((prev) => showFile(prev, fileId)), []);
  const showWarningsAt = useCallback((fileId: string, line: number) => setQuieted((prev) => showLine(prev, warnedRef.current, { fileId, line })), []);
  const announcement = useGroupAnnouncement({ check, mode, files, toolApplied: options.tool?.applied ?? null });
  const badgeFor = (fileId: string): DesignCheckBadge | undefined => {
    if (mode === 'simulation') return undefined;
    const simOnly = simOnlyBadgeText(check, overrides, fileId);
    return { ...(simOnly && { simOnly }), simModel: isSimModel(overrides, fileId), onSimModel: (on) => setSimModel(fileId, on) };
  };
  return {
    check,
    diagnostics,
    quietFile: quietWarningsOf,
    showFile: showWarningsOf,
    showLine: showWarningsAt,
    groupOf: (fileId) => check.groups.byFile.get(fileId),
    badgeFor,
    summariesFor: (runFileIds) => startSummaries({ ...options, files: files.filter((f) => runFileIds.has(f.id)) }),
    announcement,
  };
}

/** The console lines at Start for `files`, from a check of the code as it is now, not the live one of 500 ms ago. */
function startSummaries({ viewNow, mode, simulatorClock, files }: DesignCheckOptions): SummaryLine[] {
  const now = viewNow();
  const check = DESIGN_CHECKS[mode]({ view: now.view, overrides: now.overrides, simulatorClock });
  return [...simOnlySummaries(check, now.overrides, files), ...driverSummaries(check, now.overrides, files)];
}

/** The code of a line of a file, as the editor has it. */
function lineTextOf(files: DesignCheckOptions['files']): (fileId: string, line: number) => string {
  const lines = new Map(files.map((f) => [f.id, f.content.split('\n')]));
  return (fileId, line) => lines.get(fileId)?.[line - 1] ?? '';
}

/** A deleted file's dismissed warnings go with it. */
function useForgetDeletedFiles(files: DesignCheckOptions['files'], setQuieted: (update: (prev: QuietWarnings) => QuietWarnings) => void): void {
  const ids = useMemo(() => new Set(files.map((f) => f.id)), [files]);
  useEffect(() => setQuieted((prev) => onlyFiles(prev, ids)), [ids, setQuieted]);
}

/**
 * The latest change between RTL and SIM-only, said once (§ 5.3): fixing the last line
 * is the reward. A change of mode changes every group at once and is not news: the
 * student chose it (or settings.json loaded). Nor is a synthesis check's answer going
 * stale after an edit (§ 7): "now RTL" would claim what nothing has checked.
 */
interface AnnouncementInput {
  readonly check: DesignCheck;
  readonly mode: DesignCheckMode;
  readonly files: DesignCheckOptions['files'];
  /** The synthesis check's answer that fits the code, or null. */
  readonly toolApplied: object | null;
}

function useGroupAnnouncement({ check, mode, files, toolApplied }: AnnouncementInput): string {
  const [announcement, setAnnouncement] = useState('');
  const previous = useRef({ mode, groups: check.groups.byFile, toolApplied });
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(() => {
    const before = previous.current;
    previous.current = { mode, groups: check.groups.byFile, toolApplied };
    if (before.mode !== mode) return;
    if (before.toolApplied !== null && toolApplied === null) return;
    const nameOf = (fileId: string) => filesRef.current.find((f) => f.id === fileId)?.name;
    const changes = groupChanges(before.groups, check.groups.byFile, nameOf);
    if (changes.length > 0) setAnnouncement(changes.join('. '));
  }, [check, mode, toolApplied]);
  return announcement;
}
