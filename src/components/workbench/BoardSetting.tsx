// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { DEFAULT_BOARD, findBoard } from '../../boards/boardCatalog';
import type { BoardCatalog } from '../../boards/types';
import { FlatSelect } from '../waveform/FlatSelect';
import { BoardResourceLinks } from './BoardResourceLinks';
import { BOARD_TEXT, BOARDS_DOC_URL, boardSummary, notInstalledNote, notInstalledOption } from './boardText';
import { ExternalLink } from './ExternalLink';
import { InfoIcon, OpenInIcon } from './icons';
import './BoardSetting.css';

export interface BoardSettingProps {
  boards: BoardCatalog;
  /** The open project's board id; it may name a board that is not installed here. */
  boardId: string;
  /** Loading or saving the project, or compiling: the board cannot change just now. */
  locked: boolean;
  onChange: (id: string) => void;
  onViewSettings?: () => void;
}

/**
 * Settings › Board & I/O › Board (docs/board_io_config_spec.md § 3.2): a dropdown of the
 * boards, a line about the chosen one, and where the list comes from. A project on a board
 * that is not installed keeps that board as its choice, marked so. The card around it
 * carries the title.
 */
export function BoardSetting({ boards, boardId, locked, onChange, onViewSettings }: BoardSettingProps) {
  const { board, installed } = findBoard(boards, boardId);
  const ids = boards.boards.map((candidate) => candidate.id);
  const options = installed ? ids : [...ids, boardId];
  const nameOf = (id: string): string => findBoard(boards, id).board.name;
  const labelOf = (id: string): string => (id === boardId && !installed ? notInstalledOption(id, DEFAULT_BOARD) : nameOf(id));
  return (
    <div className="wb-board-setting">
      <FlatSelect value={boardId} options={options} label={BOARD_TEXT.settingTitle} labelOf={labelOf} className="wb-board-select" disabled={locked} onChange={onChange} />
      <p className="wb-board-setting__info">
        {installed ? (
          <>
            <strong>{BOARD_TEXT.settingDetails}</strong> {boardSummary(board)}
          </>
        ) : (
          notInstalledNote(boardId, DEFAULT_BOARD)
        )}
      </p>
      {installed && board.description && <p className="wb-board-setting__info">{board.description}</p>}
      {installed && <BoardResourceLinks resources={board.resources} className="wb-board-setting__links" />}
      {onViewSettings && <button type="button" className="wb-board-setting__action" onClick={onViewSettings}>{BOARD_TEXT.settingManage}</button>}
      <BoardFileNote canManage={Boolean(onViewSettings)} />
      {boards.warnings.map((warning) => (
        <span key={warning} className="wb-settings__note wb-settings__note--error">
          ⚠ {warning}
        </span>
      ))}
    </div>
  );
}

/** Where the boards come from. */
function BoardFileNote({ canManage }: { canManage: boolean }) {
  return (
    <div className="wb-board-setting__note" role="note">
      <InfoIcon className="wb-board-setting__note-icon" aria-hidden="true" />
      <div>
        <p>{BOARD_TEXT.settingNote} {canManage ? BOARD_TEXT.settingFileLead : BOARD_TEXT.settingFileEdit}</p>
        <ExternalLink className="wb-board-setting__help" href={BOARDS_DOC_URL}>{BOARD_TEXT.settingHowTo} <OpenInIcon aria-hidden="true" /></ExternalLink>
      </div>
    </div>
  );
}
