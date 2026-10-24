// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { DEFAULT_BOARD, findBoard } from '../../boards/boardCatalog';
import type { BoardCatalog } from '../../boards/types';
import { FlatSelect } from '../waveform/FlatSelect';
import { BOARD_TEXT, BOARDS_DOC_URL, notInstalledNote, notInstalledOption } from './boardText';
import { InfoIcon } from './icons';
import './BoardSetting.css';

export interface BoardSettingProps {
  boards: BoardCatalog;
  /** The open project's board id; it may name a board that is not installed here. */
  boardId: string;
  /** Loading or saving the project, or compiling: the board cannot change just now. */
  locked: boolean;
  onChange: (id: string) => void;
}

/**
 * Settings › Board (docs/board_io_config_spec.md § 3.2): a dropdown of the boards, a
 * line about the chosen one, and where the list comes from. A project on a board that
 * is not installed keeps that board as its choice, marked so.
 */
export function BoardSetting({ boards, boardId, locked, onChange }: BoardSettingProps) {
  const { board, installed } = findBoard(boards, boardId);
  const ids = boards.boards.map((candidate) => candidate.id);
  const options = installed ? ids : [...ids, boardId];
  const nameOf = (id: string): string => findBoard(boards, id).board.name;
  const labelOf = (id: string): string => (id === boardId && !installed ? notInstalledOption(id, DEFAULT_BOARD) : nameOf(id));
  return (
    <fieldset className="wb-settings__group">
      <legend className="wb-settings__heading">{BOARD_TEXT.settingTitle}</legend>
      <FlatSelect value={boardId} options={options} label={BOARD_TEXT.settingTitle} labelOf={labelOf} className="wb-board-select" disabled={locked} onChange={onChange} />
      <p className="wb-board-setting__info">
        {installed ? (
          <>
            <strong>{board.name}</strong> {board.description}
          </>
        ) : (
          notInstalledNote(boardId, DEFAULT_BOARD)
        )}
      </p>
      <BoardFileNote />
      {boards.warnings.map((warning) => (
        <span key={warning} className="wb-settings__note wb-settings__note--error">
          ⚠ {warning}
        </span>
      ))}
    </fieldset>
  );
}

/** Where the boards come from, and that only names can change. */
function BoardFileNote() {
  return (
    <div className="wb-board-setting__note" role="note">
      <InfoIcon className="wb-board-setting__note-icon" aria-hidden="true" />
      <div>
        <p>
          {BOARD_TEXT.settingFileLead} <em>boards/boards.json</em>. {BOARD_TEXT.settingFileEdit}{' '}
          <a href={BOARDS_DOC_URL} target="_blank" rel="noopener noreferrer">
            {BOARD_TEXT.settingHowTo}
          </a>
        </p>
        <p className="wb-board-setting__note-small">
          {BOARD_TEXT.settingNote} {BOARD_TEXT.settingFixedShape}
        </p>
      </div>
    </div>
  );
}
