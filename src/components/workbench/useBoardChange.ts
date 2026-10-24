// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useRef, useState } from 'react';
import { findBoard } from '../../boards/boardCatalog';
import { canUndo, type BoardChangeRecord } from '../../boards/boardChangeUndo';
import { applyBoardChange, canApply, planBoardChange, renameWaveViews, type BoardChangePlan } from '../../boards/renamePorts';
import { savePreferredBoard } from '../../boards/preferredBoard';
import type { BoardCatalog, BoardDefinition } from '../../boards/types';
import { BOARD_TEXT, boardOnlyLog, boardRenamedLog, boardUndoneLog } from './boardText';
import type { ConsoleLink } from './ConsoleOutput';
import type { VhdlFile } from './files';
import type { OpenProject } from './projectFile';

/** What the board-change dialog shows (docs/board_io_config_spec.md § 3.3, § 3.5). */
export type PendingBoardChange =
  /** Change board? — the renames a board change would make, or why they cannot be made. */
  | { readonly kind: 'change'; readonly plan: BoardChangePlan; readonly fromSettings: boolean }
  /** Port names do not match the board — the top file uses `other`'s names. */
  | { readonly kind: 'mismatch'; readonly fileName: string; readonly other: BoardDefinition; readonly active: BoardDefinition };

export interface BoardChangeOptions {
  files: VhdlFile[];
  setFiles: (files: VhdlFile[]) => void;
  project: OpenProject;
  setProject: (update: (project: OpenProject) => OpenProject) => void;
  catalog: BoardCatalog;
  /** Stops a running simulation: it was built with the old names. */
  stopSimulation: () => void;
  /** Settings closes for the question; Cancel brings it back, so the student is where they started. */
  reopenSettings: () => void;
  log: (text: string, link?: ConsoleLink) => void;
  /** Loading or saving the project, or compiling a run: requests are ignored (the selectors are disabled too). */
  busy: boolean;
}

export interface BoardChange {
  readonly pending: PendingBoardChange | null;
  /** Settings › Board, the Project page, and the mismatch dialog's Switch board. */
  readonly requestBoardChange: (toId: string, origin?: { fromSettings: boolean }) => void;
  /** The mismatch dialog's Rename files: the files go from `source`'s names to the active board's; the board stays. */
  readonly requestRenameToBoard: (source: BoardDefinition) => void;
  /** The mismatch hint's Fix…. */
  readonly offerMismatchFix: (fileName: string, other: BoardDefinition) => void;
  readonly confirmUpdate: () => void;
  readonly confirmBoardOnly: () => void;
  readonly cancel: () => void;
}

/** What one board change replaced: enough to restore all of it (§ 3.3). */
type ChangeRecord = BoardChangeRecord<VhdlFile[]>;

/**
 * Every board change: the question, the all-or-nothing rename, and one step of Undo
 * (§ 3.3). The work is done by the pure functions of src/boards/; this holds what is
 * pending and what Undo would restore, and applies a change in one batch of state updates.
 */
export function useBoardChange(options: BoardChangeOptions): BoardChange {
  const [pending, setPending] = useState<PendingBoardChange | null>(null);
  // Read by the console's Undo link and the dialog's buttons, which may run after later renders.
  const latest = useRef(options);
  latest.current = options;
  const record = useRef<ChangeRecord | null>(null);

  const activeBoard = (): BoardDefinition => findBoard(latest.current.catalog, latest.current.project.board).board;

  /** Restores what the last board change replaced — only while nothing has changed since (`canUndo`). */
  const undo = useCallback(() => {
    const done = record.current;
    const { files, project, catalog, setFiles, setProject, stopSimulation, log } = latest.current;
    if (done === null || !canUndo(done, { files, board: project.board })) {
      log(BOARD_TEXT.nothingToUndo);
      return;
    }
    record.current = null;
    stopSimulation();
    setFiles(done.before.files);
    setProject((p) => withWaveViews({ ...p, board: done.before.board }, done.before.waveViews));
    savePreferredBoard(done.before.board);
    log(boardUndoneLog(findBoard(catalog, done.before.board).board));
  }, []);

  /** Applies `files` and `board` together, remembers how to go back, and offers Undo in the console. */
  const commit = useCallback(
    (files: VhdlFile[], board: BoardDefinition, plan: BoardChangePlan | null, message: string) => {
      const { project, setFiles, setProject, stopSimulation, log } = latest.current;
      record.current = {
        before: { files: latest.current.files, board: project.board, waveViews: project.waveViews },
        after: { files, board: board.id },
      };
      stopSimulation();
      setFiles(files);
      setProject((p) => withWaveViews({ ...p, board: board.id }, plan ? renameWaveViews(p.waveViews, plan.renames) : p.waveViews));
      savePreferredBoard(board.id);
      log(message, { label: BOARD_TEXT.undo, onClick: undo });
    },
    [undo],
  );

  const applyPlan = useCallback(
    (plan: BoardChangePlan) => {
      const files = applyBoardChange(latest.current.files, plan);
      commit(files, plan.to, plan, boardRenamedLog(plan.to, plan.totalCount, plan.changes.length));
    },
    [commit],
  );

  const requestBoardChange = useCallback(
    (toId: string, origin = { fromSettings: false }) => {
      const { busy, project, catalog, files } = latest.current;
      const target = findBoard(catalog, toId);
      if (busy || toId === project.board || !target.installed) return;
      // A board that is not installed here runs with the Default names, so its files are renamed from those.
      const plan = planBoardChange(files, activeBoard(), target.board);
      const nothingToRename = plan.changes.length === 0 && canApply(plan);
      if (nothingToRename) commit(files, target.board, null, boardOnlyLog(target.board));
      else setPending({ kind: 'change', plan, fromSettings: origin.fromSettings });
    },
    [commit],
  );

  const requestRenameToBoard = useCallback(
    (source: BoardDefinition) => {
      if (latest.current.busy) return;
      const plan = planBoardChange(latest.current.files, source, activeBoard());
      // The student chose to rename: it is done at once, unless a conflict has to be shown first.
      if (canApply(plan)) {
        setPending(null);
        applyPlan(plan);
      } else setPending({ kind: 'change', plan, fromSettings: false });
    },
    [applyPlan],
  );

  const offerMismatchFix = useCallback((fileName: string, other: BoardDefinition) => {
    setPending({ kind: 'mismatch', fileName, other, active: activeBoard() });
  }, []);

  const confirmUpdate = useCallback(() => {
    if (pending?.kind !== 'change' || !canApply(pending.plan)) return;
    // The dialog is modal, so the files cannot have changed; checked anyway, so what is applied is what was shown.
    if (latest.current.files !== pending.plan.basis) {
      setPending({ ...pending, plan: planBoardChange(latest.current.files, pending.plan.from, pending.plan.to) });
      return;
    }
    setPending(null);
    applyPlan(pending.plan);
  }, [pending, applyPlan]);

  const confirmBoardOnly = useCallback(() => {
    if (pending?.kind !== 'change') return;
    setPending(null);
    commit(latest.current.files, pending.plan.to, null, boardOnlyLog(pending.plan.to));
  }, [pending, commit]);

  const cancel = useCallback(() => {
    const reopen = pending?.kind === 'change' && pending.fromSettings;
    setPending(null);
    if (reopen) latest.current.reopenSettings();
  }, [pending]);

  return { pending, requestBoardChange, requestRenameToBoard, offerMismatchFix, confirmUpdate, confirmBoardOnly, cancel };
}

/** The project with exactly these saved waveform views: none saved leaves the field out. */
function withWaveViews(project: OpenProject, waveViews: OpenProject['waveViews']): OpenProject {
  const { waveViews: _replaced, ...rest } = project;
  return waveViews === undefined ? rest : { ...rest, waveViews };
}
