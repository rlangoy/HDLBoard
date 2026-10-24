// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import { findBoard } from '../../boards/boardCatalog';
import { canUndo, type BoardChangeRecord } from '../../boards/boardChangeUndo';
import type { PortRename } from '../../boards/boardPorts';
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

/** The options as of the latest render: read by callbacks that run after later renders (the console's Undo). */
type Latest = MutableRefObject<BoardChangeOptions>;

/** One board change, ready to apply: the files it leaves, the board, and what the console says. */
interface BoardChangeResult {
  readonly files: VhdlFile[];
  readonly board: BoardDefinition;
  /** The renames made, which the saved waveform views follow; none for a board-only change. */
  readonly renames: readonly PortRename[];
  readonly message: string;
}

/**
 * Every board change: the question, the all-or-nothing rename, and one step of Undo
 * (§ 3.3). The work is done by the pure functions of src/boards/; this holds what is
 * pending and what Undo would restore, and applies a change in one batch of state updates.
 */
export function useBoardChange(options: BoardChangeOptions): BoardChange {
  const [pending, setPending] = useState<PendingBoardChange | null>(null);
  const latest = useRef(options);
  latest.current = options;
  const commit = useUndoableCommit(latest);
  const requests = useBoardRequests(latest, commit, setPending);
  const answers = usePendingAnswers(latest, { pending, setPending, commit });
  return { pending, ...requests, ...answers };
}

/** The board the open project uses here: its own, or Default when that is not installed. */
const activeBoardOf = (latest: Latest): BoardDefinition => findBoard(latest.current.catalog, latest.current.project.board).board;

/** A change that renames the files as `plan` says. */
function renamedBy(latest: Latest, plan: BoardChangePlan): BoardChangeResult {
  const files = applyBoardChange(latest.current.files, plan);
  return { files, board: plan.to, renames: plan.renames, message: boardRenamedLog(plan.to, plan.totalCount, plan.changes.length) };
}

/** A change of the board alone: the files stay exactly as they are. */
function boardOnly(latest: Latest, board: BoardDefinition): BoardChangeResult {
  return { files: latest.current.files, board, renames: [], message: boardOnlyLog(board) };
}

/** Applies a change in one batch of state updates, remembers what it replaced, and offers Undo in the console. */
function useUndoableCommit(latest: Latest): (change: BoardChangeResult) => void {
  const record = useRef<ChangeRecord | null>(null);

  // Restores what the last board change replaced — only while nothing has changed since (`canUndo`).
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
  }, [latest]);

  return useCallback(
    ({ files, board, renames, message }: BoardChangeResult) => {
      const { project, setFiles, setProject, stopSimulation, log } = latest.current;
      record.current = {
        before: { files: latest.current.files, board: project.board, waveViews: project.waveViews },
        after: { files, board: board.id },
      };
      stopSimulation();
      setFiles(files);
      setProject((p) => withWaveViews({ ...p, board: board.id }, renameWaveViews(p.waveViews, renames)));
      savePreferredBoard(board.id);
      log(message, { label: BOARD_TEXT.undo, onClick: undo });
    },
    [latest, undo],
  );
}

type Requests = Pick<BoardChange, 'requestBoardChange' | 'requestRenameToBoard' | 'offerMismatchFix'>;

/** The three ways a board change starts: choose a board, rename the files to the board, or the mismatch hint. */
function useBoardRequests(latest: Latest, commit: (change: BoardChangeResult) => void, setPending: (pending: PendingBoardChange | null) => void): Requests {
  const requestBoardChange = useCallback(
    (toId: string, origin = { fromSettings: false }) => {
      const { busy, project, catalog, files } = latest.current;
      const target = findBoard(catalog, toId);
      if (busy || toId === project.board || !target.installed) return;
      // A board that is not installed here runs with the Default names, so its files are renamed from those.
      const plan = planBoardChange(files, activeBoardOf(latest), target.board);
      const nothingToRename = plan.changes.length === 0 && canApply(plan);
      if (nothingToRename) commit(boardOnly(latest, target.board));
      else setPending({ kind: 'change', plan, fromSettings: origin.fromSettings });
    },
    [latest, commit, setPending],
  );

  const requestRenameToBoard = useCallback(
    (source: BoardDefinition) => {
      if (latest.current.busy) return;
      const plan = planBoardChange(latest.current.files, source, activeBoardOf(latest));
      // The student chose to rename: it is done at once, unless a conflict has to be shown first.
      setPending(canApply(plan) ? null : { kind: 'change', plan, fromSettings: false });
      if (canApply(plan)) commit(renamedBy(latest, plan));
    },
    [latest, commit, setPending],
  );

  const offerMismatchFix = useCallback(
    (fileName: string, other: BoardDefinition) => setPending({ kind: 'mismatch', fileName, other, active: activeBoardOf(latest) }),
    [latest, setPending],
  );

  return { requestBoardChange, requestRenameToBoard, offerMismatchFix };
}

interface PendingState {
  readonly pending: PendingBoardChange | null;
  readonly setPending: (pending: PendingBoardChange | null) => void;
  readonly commit: (change: BoardChangeResult) => void;
}

type Answers = Pick<BoardChange, 'confirmUpdate' | 'confirmBoardOnly' | 'cancel'>;

/** The answers to Change board?: Update files, Change board only, or Cancel. */
function usePendingAnswers(latest: Latest, { pending, setPending, commit }: PendingState): Answers {
  const confirmUpdate = useCallback(() => {
    if (pending?.kind !== 'change' || !canApply(pending.plan)) return;
    // The dialog is modal, so the files cannot have changed; checked anyway, so what is applied is what was shown.
    if (latest.current.files !== pending.plan.basis) {
      setPending({ ...pending, plan: planBoardChange(latest.current.files, pending.plan.from, pending.plan.to) });
      return;
    }
    setPending(null);
    commit(renamedBy(latest, pending.plan));
  }, [latest, pending, setPending, commit]);

  const confirmBoardOnly = useCallback(() => {
    if (pending?.kind !== 'change') return;
    setPending(null);
    commit(boardOnly(latest, pending.plan.to));
  }, [latest, pending, setPending, commit]);

  const cancel = useCallback(() => {
    const reopen = pending?.kind === 'change' && pending.fromSettings;
    setPending(null);
    if (reopen) latest.current.reopenSettings();
  }, [latest, pending, setPending]);

  return { confirmUpdate, confirmBoardOnly, cancel };
}

/** The project with exactly these saved waveform views: none saved leaves the field out. */
function withWaveViews(project: OpenProject, waveViews: OpenProject['waveViews']): OpenProject {
  const { waveViews: _replaced, ...rest } = project;
  return waveViews === undefined ? rest : { ...rest, waveViews };
}
