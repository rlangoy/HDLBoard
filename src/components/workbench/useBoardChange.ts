// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import { findBoard } from '../../boards/boardCatalog';
import { canUndo, viewsAfterUndo, type BoardChangeRecord, type BoardChangeState } from '../../boards/boardChangeUndo';
import type { PortRename } from '../../boards/boardPorts';
import { applyBoardChange, canApply, planBoardChange, renameWaveViews, testbenchLanguageIn, type BoardChangePlan } from '../../boards/renamePorts';
import { savePreferredBoard } from '../../boards/preferredBoard';
import { describeShapeChange } from '../../boards/shapeChange';
import type { BoardCatalog, BoardDefinition } from '../../boards/types';
import { BOARD_TEXT, boardOnlyLog, boardRenamedLog, boardUndoneLog } from './boardText';
import type { ConsoleLink } from './ConsoleOutput';
import type { VhdlFile } from './files';
import type { SavedWaveViews } from '../../project/types';
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
  /** Changes whenever another project replaces the open one, which ends Undo. */
  projectKey: string;
}

export interface BoardChange {
  readonly pending: PendingBoardChange | null;
  /**
   * Settings › Board, the Project page, and the mismatch dialog's Switch board. False when
   * nothing happens (busy, the same board, a board not installed), so Settings can stay open.
   */
  readonly requestBoardChange: (toId: string, origin?: { fromSettings: boolean }) => boolean;
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
  /** The board the files are now in, for the console. */
  readonly board: BoardDefinition;
  /** What the project stores: the board's id, or a project's id that is not installed here and is kept. */
  readonly boardId: string;
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
  const message = boardRenamedLog(plan.to, plan.totalCount, plan.changes.length);
  return { files, board: plan.to, boardId: plan.to.id, renames: plan.renames, message };
}

/** A change of the board alone: the files stay exactly as they are. */
function boardOnly(latest: Latest, board: BoardDefinition): BoardChangeResult {
  return { files: latest.current.files, board, boardId: board.id, renames: [], message: boardOnlyLog(board) };
}

/** The saved waveform views as the project holds them when the update is applied, made into the new ones. */
type ViewsUpdate = (current: SavedWaveViews | undefined) => SavedWaveViews | undefined;

/**
 * Puts the files and the board in place in one batch of state updates. The views are
 * worked out from the project as it is then, so a view the viewer saved in the same
 * batch is not overwritten. The preferred board is saved only when the board changes:
 * renaming the files to a shared project's board is not a choice of board for the
 * student's own new projects.
 */
function applyBoardState(latest: Latest, next: Pick<BoardChangeState<VhdlFile[]>, 'files' | 'board'>, viewsOf: ViewsUpdate): void {
  const { project, setFiles, setProject, stopSimulation } = latest.current;
  stopSimulation();
  setFiles(next.files);
  setProject((p) => withWaveViews({ ...p, board: next.board }, viewsOf(p.waveViews)));
  if (next.board !== project.board) savePreferredBoard(next.board);
}

/** Applies a change, remembers what it replaced, and offers Undo of that change in the console. */
function useUndoableCommit(latest: Latest): (change: BoardChangeResult) => void {
  const record = useRef<ChangeRecord | null>(null);

  // Each console line undoes its own change, and only while it is the last one and nothing has changed since.
  const undo = useCallback(
    (done: ChangeRecord) => {
      const { busy, files, project, projectKey, catalog, log } = latest.current;
      if (busy) {
        log(BOARD_TEXT.undoWhenFree);
        return;
      }
      if (record.current !== done || !canUndo(done, { project: projectKey, files, board: project.board })) {
        log(BOARD_TEXT.nothingToUndo);
        return;
      }
      record.current = null;
      const languageOf = testbenchLanguageIn(done.before.files);
      applyBoardState(latest, done.before, (current) => viewsAfterUndo(done, current, languageOf));
      log(boardUndoneLog(findBoard(catalog, done.before.board).board));
    },
    [latest],
  );

  return useCallback(
    (change: BoardChangeResult) => {
      const { files, project, projectKey, log } = latest.current;
      const languageOf = testbenchLanguageIn(change.files);
      const renamed = (views: SavedWaveViews | undefined) => renameWaveViews(views, change.renames, languageOf);
      const afterViews = renamed(project.waveViews);
      const done: ChangeRecord = {
        project: projectKey,
        before: { files, board: project.board, waveViews: project.waveViews },
        after: { files: change.files, board: change.boardId, waveViews: afterViews },
        renames: change.renames,
      };
      record.current = done;
      // Views changed in the same batch are renamed too; Undo then sees they differ from the record's.
      applyBoardState(latest, done.after, (current) => (current === project.waveViews ? afterViews : renamed(current)));
      log(change.message, { label: BOARD_TEXT.undo, onClick: () => undo(done) });
    },
    [latest, undo],
  );
}

/**
 * Whether a board change asks first (§ 5.3): when it renames something in the files, when
 * a file cannot be renamed, and always between boards of different shapes, so the
 * student sees the hand edits before the board changes.
 */
function needsQuestion(plan: BoardChangePlan): boolean {
  const renamesFiles = plan.changes.length > 0 || !canApply(plan);
  return renamesFiles || describeShapeChange(plan.from.ports, plan.to.ports).length > 0;
}

type Requests = Pick<BoardChange, 'requestBoardChange' | 'requestRenameToBoard' | 'offerMismatchFix'>;

/** The three ways a board change starts: choose a board, rename the files to the board, or the mismatch hint. */
function useBoardRequests(latest: Latest, commit: (change: BoardChangeResult) => void, setPending: (pending: PendingBoardChange | null) => void): Requests {
  const requestBoardChange = useCallback(
    (toId: string, origin = { fromSettings: false }) => {
      const { busy, project, catalog, files } = latest.current;
      const target = findBoard(catalog, toId);
      if (busy || toId === project.board || !target.installed) return false;
      // A board that is not installed here runs with the Default names, so its files are renamed from those.
      const plan = planBoardChange(files, activeBoardOf(latest), target.board);
      const ask = needsQuestion(plan);
      // A mismatch dialog that asked for this is answered either way.
      setPending(ask ? { kind: 'change', plan, fromSettings: origin.fromSettings } : null);
      if (!ask) commit(boardOnly(latest, target.board));
      return true;
    },
    [latest, commit, setPending],
  );

  const requestRenameToBoard = useCallback(
    (source: BoardDefinition) => {
      if (latest.current.busy) return;
      const plan = planBoardChange(latest.current.files, source, activeBoardOf(latest));
      // The student chose to rename: it is done at once, unless a conflict has to be shown first.
      setPending(canApply(plan) ? null : { kind: 'change', plan, fromSettings: false });
      // The board stays as it is, even a project's board that is not installed here.
      if (canApply(plan)) commit({ ...renamedBy(latest, plan), boardId: latest.current.project.board });
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
