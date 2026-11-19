// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdvisedDiagnostic } from '../diagnosticAdvice';
import type { DesignCheckBadge } from '../EditorPaneHeader';
import type { TestbenchOverrides } from '../tbDetect/types';
import { DESIGN_CHECKS } from './designCheck';
import { checkDiagnostics } from './findingDiagnostics';
import { NO_QUIET_WARNINGS, quietFile, showFile, showLine, withQuieted, type QuietWarnings } from './quietWarnings';
import { isSimModel } from './simModels';
import { driverSummaries, groupChanges, simOnlyBadgeText, simOnlySummaries, type SummaryLine } from './simOnlyReport';
import type { DesignCheck, DesignCheckMode, DesignView, FileGroup } from './types';

export interface DesignCheckOptions {
  /** `TestbenchSplit.designView`: recomputed with the detector, 500 ms after typing stops. */
  readonly view: DesignView;
  readonly overrides: TestbenchOverrides;
  readonly mode: DesignCheckMode;
  /** The files as the editor has them now. */
  readonly files: readonly { readonly id: string; readonly name: string; readonly content: string }[];
  readonly setSimModel: (fileId: string, simModel: boolean) => void;
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
  /** The console lines at Start: one per SIM-only file, one per signal with more than one driver. */
  readonly summaries: () => SummaryLine[];
  /** For a polite live region: the last change of a file between RTL and SIM-only. */
  readonly announcement: string;
}

/**
 * The design check of docs/impl_sim_only_warnings.md, for the Workbench. The check runs
 * only when the detector's analysis, the overrides or the mode change, never per
 * keystroke; per keystroke only the line counts are compared (findingDiagnostics.ts).
 */
export function useDesignCheck(options: DesignCheckOptions): DesignCheckApi {
  const { view, overrides, mode, files, setSimModel } = options;
  const check = useMemo(() => DESIGN_CHECKS[mode]({ view, overrides }), [view, overrides, mode]);
  const loud = useMemo(
    () => checkDiagnostics(check, { analysis: view.raw, overrides, files }),
    [check, view.raw, overrides, files],
  );
  const [quieted, setQuieted] = useState<QuietWarnings>(NO_QUIET_WARNINGS);
  const diagnostics = useMemo(() => withQuieted(loud, quieted), [loud, quieted]);
  const loudRef = useRef(loud);
  loudRef.current = loud;
  const quietWarningsOf = useCallback((fileId: string) => setQuieted((prev) => quietFile(prev, loudRef.current, fileId)), []);
  const showWarningsOf = useCallback((fileId: string) => setQuieted((prev) => showFile(prev, fileId)), []);
  const showWarningsAt = useCallback((fileId: string, line: number) => setQuieted((prev) => showLine(prev, loudRef.current, { fileId, line })), []);
  const announcement = useGroupAnnouncement(check, mode, files);
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
    summaries: () => [...simOnlySummaries(check, overrides, files), ...driverSummaries(check, overrides, files)],
    announcement,
  };
}

/**
 * The latest change between RTL and SIM-only, said once (§ 5.3): fixing the last line
 * is the reward. A change of mode changes every group at once and is not news: the
 * student chose it (or settings.json loaded).
 */
function useGroupAnnouncement(check: DesignCheck, mode: DesignCheckMode, files: DesignCheckOptions['files']): string {
  const [announcement, setAnnouncement] = useState('');
  const previous = useRef({ mode, groups: check.groups.byFile });
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(() => {
    const before = previous.current;
    previous.current = { mode, groups: check.groups.byFile };
    if (before.mode !== mode) return;
    const nameOf = (fileId: string) => filesRef.current.find((f) => f.id === fileId)?.name;
    const changes = groupChanges(before.groups, check.groups.byFile, nameOf);
    if (changes.length > 0) setAnnouncement(changes.join('. '));
  }, [check, mode]);
  return announcement;
}
