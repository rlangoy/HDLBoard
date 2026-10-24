// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { canApply, type BoardChangePlan } from '../../boards/renamePorts';
import type { BoardDefinition } from '../../boards/types';
import { Dialog } from './Dialog';
import { ChipIcon } from './icons';
import {
  BOARD_TEXT,
  boardChangeHeading,
  conflictLine,
  filesUseNames,
  filesWillChange,
  mismatchLead,
  renameFilesTo,
  renameRows,
  switchBoardTo,
} from './boardText';
import type { PendingBoardChange } from './useBoardChange';
import './NewFileDialog.css';
import './BoardChangeDialog.css';

export interface BoardChangeDialogProps {
  pending: PendingBoardChange;
  /** A simulation is running: the dialog says it will be stopped. */
  simulating: boolean;
  onUpdateFiles: () => void;
  onBoardOnly: () => void;
  onSwitchBoard: (board: BoardDefinition) => void;
  onRenameFiles: (source: BoardDefinition) => void;
  onCancel: () => void;
}

/** Change board? or Port names do not match the board (docs/board_io_config_spec.md § 3.3, § 3.5). */
export function BoardChangeDialog({ pending, simulating, onUpdateFiles, onBoardOnly, onSwitchBoard, onRenameFiles, onCancel }: BoardChangeDialogProps) {
  if (pending.kind === 'mismatch') {
    return (
      <Dialog
        open
        onClose={onCancel}
        title={BOARD_TEXT.mismatchTitle}
        subtitle={mismatchLead(pending.fileName, pending.other, pending.active)}
        icon={<ChipIcon />}
        footer={
          <div className="wb-newfile__buttons">
            <button type="button" className="wb-newfile__cancel" onClick={onCancel}>
              {BOARD_TEXT.cancel}
            </button>
            <button type="button" className="wb-newfile__cancel" onClick={() => onRenameFiles(pending.other)}>
              {renameFilesTo(pending.active)}
            </button>
            <button type="button" className="wb-dialog__close" autoFocus onClick={() => onSwitchBoard(pending.other)}>
              {switchBoardTo(pending.other)}
            </button>
          </div>
        }
      >
        <MismatchChoices pending={pending} />
      </Dialog>
    );
  }
  const { plan } = pending;
  const updatable = canApply(plan);
  return (
    <Dialog
      open
      onClose={onCancel}
      title={BOARD_TEXT.changeTitle}
      subtitle={boardChangeHeading(plan.from, plan.to)}
      icon={<ChipIcon />}
      footer={
        <div className="wb-newfile__buttons">
          <button type="button" className="wb-newfile__cancel" onClick={onCancel}>
            {BOARD_TEXT.cancel}
          </button>
          <button type="button" className="wb-newfile__cancel" autoFocus={!updatable} onClick={onBoardOnly}>
            {BOARD_TEXT.boardOnly}
          </button>
          <button type="button" className="wb-dialog__close" autoFocus={updatable} disabled={!updatable} onClick={onUpdateFiles}>
            {BOARD_TEXT.updateFiles}
          </button>
        </div>
      }
    >
      <p className="wb-dialog__lead">{filesUseNames(plan.from)}</p>
      <RenameList plan={plan} />
      {updatable ? <ChangedFiles plan={plan} /> : <Conflicts plan={plan} />}
      <dl className="wb-boardchange__choices">
        <div>
          <dt>{BOARD_TEXT.updateFiles}</dt>
          <dd>{BOARD_TEXT.updateFilesNote}</dd>
        </div>
        <div>
          <dt>{BOARD_TEXT.boardOnly}</dt>
          <dd>{BOARD_TEXT.boardOnlyNote}</dd>
        </div>
      </dl>
      <p className="wb-boardchange__note">
        {BOARD_TEXT.stringsNote}
        {simulating && ` ${BOARD_TEXT.stopsSimulation}`}
      </p>
    </Dialog>
  );
}

/** `KEY_N → KEY`, the displays as one row. */
function RenameList({ plan }: { plan: BoardChangePlan }) {
  return (
    <ul className="wb-boardchange__renames" aria-label="Renames">
      {renameRows(plan.renames, plan.from).map((row) => (
        <li key={row.from}>
          <code>{row.from}</code>
          <span aria-hidden="true">→</span>
          <span className="wb-sr-only">to</span>
          <code>{row.to}</code>
        </li>
      ))}
    </ul>
  );
}

function ChangedFiles({ plan }: { plan: BoardChangePlan }) {
  return <p className="wb-boardchange__files">{filesWillChange(plan.changes.map((change) => change.fileName), plan.totalCount)}</p>;
}

/** All or nothing (D6): one file that cannot be renamed safely blocks Update files, and says why. */
function Conflicts({ plan }: { plan: BoardChangePlan }) {
  return (
    <div className="wb-dialog__callout wb-boardchange__conflicts" role="alert">
      <p className="wb-dialog__callout-title">⚠ {BOARD_TEXT.cannotUpdate}</p>
      <ul>
        {plan.conflicts.flatMap(({ fileName, reasons }) => reasons.map((reason) => <li key={`${fileName}:${reason}`}>{conflictLine(fileName, reason)}</li>))}
      </ul>
      <p>{BOARD_TEXT.renameByHand}</p>
    </div>
  );
}

/** What each way out does, in the words of the buttons. */
function MismatchChoices({ pending }: { pending: Extract<PendingBoardChange, { kind: 'mismatch' }> }) {
  return (
    <dl className="wb-boardchange__choices">
      <div>
        <dt>{switchBoardTo(pending.other)}</dt>
        <dd>The board takes the names your file uses. Files that still use the {pending.active.name} names are renamed.</dd>
      </div>
      <div>
        <dt>{renameFilesTo(pending.active)}</dt>
        <dd>Your files take the {pending.active.name} board's names; the board stays.</dd>
      </div>
    </dl>
  );
}
