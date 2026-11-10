// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useId, useRef } from 'react';
import { cx } from '../../board';
import { DEFAULT_BOARD, findBoard } from '../../../boards/boardCatalog';
import type { BoardCatalog } from '../../../boards/types';
import { BOARD_TEXT, notInstalledNote, notInstalledOption } from '../boardText';
import { InfoIcon } from '../icons';
import { FoldingPageCard } from '../page/PageCard';
import type { OpenProject, ProjectDetails } from '../projectFile';
import { AutoTextArea } from './AutoTextArea';

/** The project's board: the boards installed here, and the way to change it. */
export interface BoardChoice {
  /** The Board list (docs/board_io_config_spec.md § 3.4). */
  boards: BoardCatalog;
  /** Another board was chosen: asks, and renames the files, as Settings › Board does. */
  onChange: (id: string) => void;
  /** Loading, saving or compiling: the board cannot change just now. */
  locked: boolean;
  /** Choose a board…, for a project on a board not installed here: opens Settings. */
  onChooseBoard: () => void;
}

/** The name field asks for a name: why, and whether the student was just stopped for want of one. */
export interface NameRequest {
  /** The project has no name of its own yet (projectNeedsName): the field is shown empty. */
  needed: boolean;
  /** A save was stopped for want of a name: the hint turns into an error. */
  missing: boolean;
  /** The focus is to move to the name field (Rename…, or a save stopped); onFocused says it has. */
  focusPending: boolean;
  onFocused: () => void;
}

export interface ProjectDetailsCardProps {
  project: OpenProject;
  onChange: (details: ProjectDetails) => void;
  board: BoardChoice;
  name: NameRequest;
}

/** Active project › Project details: the name, the board and the description. */
export function ProjectDetailsCard({ project, onChange, board, name }: ProjectDetailsCardProps) {
  const ids = useId();
  return (
    <FoldingPageCard title="Project details" icon={<InfoIcon />} unfold={name.focusPending}>
      <div className="wb-active__form">
        <label htmlFor={`${ids}-name`}>Name</label>
        <NameField id={`${ids}-name`} value={project.name} request={name} onChange={(value) => onChange({ name: value })} />

        <label htmlFor={`${ids}-board`}>Board</label>
        <BoardSelect id={`${ids}-board`} boardId={project.board} choice={board} />

        <label htmlFor={`${ids}-description`}>Description</label>
        <AutoTextArea
          id={`${ids}-description`}
          value={project.description}
          placeholder="What the project is about: the exercise, what to try on the board…"
          onChange={(description) => onChange({ description })}
          minRows={3}
          pencilWhenEmpty
        />
      </div>
    </FoldingPageCard>
  );
}

interface NameFieldProps {
  id: string;
  value: string;
  request: NameRequest;
  onChange: (name: string) => void;
}

/** The project's name; while it has none of its own, shown empty, asking for one. */
function NameField({ id, value, request, onChange }: NameFieldProps) {
  const ref = useNameFocus(request, value === '');
  const look = request.needed ? askingLook(id, request.missing) : NAMED_LOOK;
  return (
    <div>
      <input ref={ref} id={id} {...look} value={request.needed ? '' : value} spellCheck={false} onChange={(event) => onChange(event.target.value)} />
      {request.needed && (
        <span id={`${id}-hint`} className={cx('wb-active__hint', request.missing && 'is-error')} role="status">
          Project name is required before it is saved
        </span>
      )}
    </div>
  );
}

const NAMED_LOOK = { className: 'wb-active__field', placeholder: 'Project name' };

/** The empty field asking for a name, in red once a save was stopped for want of one. */
function askingLook(id: string, missing: boolean) {
  return {
    className: cx('wb-active__field is-asking', missing && 'is-error'),
    placeholder: 'Enter project name',
    'aria-describedby': `${id}-hint`,
    'aria-invalid': missing || undefined,
  };
}

/** The name field, focused when asked to, and at once for a project that has no name yet. */
function useNameFocus({ focusPending, onFocused }: NameRequest, unnamed: boolean) {
  const ref = useRef<HTMLInputElement>(null);
  const startsUnnamed = useRef(unnamed);
  useEffect(() => {
    if (startsUnnamed.current) ref.current?.focus();
  }, []);
  useEffect(() => {
    if (!focusPending) return;
    ref.current?.focus();
    onFocused();
  }, [focusPending, onFocused]);
  return ref;
}

/**
 * The project's board, from the boards installed here, each described in its tooltip.
 * A board that is not installed stays selected, with a note: the id is kept when the
 * project is saved, until the student chooses another board.
 */
function BoardSelect({ id, boardId, choice }: { id: string; boardId: string; choice: BoardChoice }) {
  const installed = findBoard(choice.boards, boardId).installed;
  return (
    <div>
      <select id={id} className="wb-active__field wb-active__select" value={boardId} disabled={choice.locked} onChange={(event) => choice.onChange(event.target.value)}>
        {choice.boards.boards.map((board) => (
          <option key={board.id} value={board.id} title={board.description}>
            {board.name}
          </option>
        ))}
        {!installed && <option value={boardId}>{notInstalledOption(boardId, DEFAULT_BOARD)}</option>}
      </select>
      {!installed && (
        <span className="wb-active__hint is-warn" role="note">
          {notInstalledNote(boardId, DEFAULT_BOARD)}{' '}
          <button type="button" className="wb-projects__link" onClick={choice.onChooseBoard}>
            {BOARD_TEXT.chooseBoard}
          </button>
        </span>
      )}
    </div>
  );
}
