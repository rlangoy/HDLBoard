// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { canApply, type BoardChangePlan } from '../../boards/renamePorts';
import { describeShapeChange, formatShapeDifference, type ShapeDifference } from '../../boards/shapeChange';
import type { BoardDefinition } from '../../boards/types';
import { BoardResourceLinks } from './BoardResourceLinks';
import { Dialog } from './Dialog';
import { ChipIcon } from './icons';
import {
  BOARD_TEXT,
  boardChangeHeading,
  conflictLine,
  differentIo,
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
export function BoardChangeDialog(props: BoardChangeDialogProps) {
  const { pending } = props;
  return pending.kind === 'mismatch' ? <MismatchDialog {...props} pending={pending} /> : <ChangeDialog {...props} pending={pending} />;
}

type MismatchProps = BoardChangeDialogProps & { pending: Extract<PendingBoardChange, { kind: 'mismatch' }> };
type ChangeProps = BoardChangeDialogProps & { pending: Extract<PendingBoardChange, { kind: 'change' }> };

function MismatchDialog({ pending, onSwitchBoard, onRenameFiles, onCancel }: MismatchProps) {
  const footer = (
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
  );
  const subtitle = mismatchLead(pending.fileName, pending.other, pending.active);
  return (
    <Dialog open onClose={onCancel} title={BOARD_TEXT.mismatchTitle} subtitle={subtitle} icon={<ChipIcon />} footer={footer}>
      <MismatchChoices pending={pending} />
    </Dialog>
  );
}

function ChangeDialog({ pending: { plan }, simulating, onUpdateFiles, onBoardOnly, onCancel }: ChangeProps) {
  const differences = describeShapeChange(plan.from.ports, plan.to.ports);
  const renames = plan.changes.length > 0 || !canApply(plan);
  const subtitle = boardChangeHeading(plan.from, plan.to);
  const footer = <ChangeButtons plan={plan} renames={renames} onUpdateFiles={onUpdateFiles} onBoardOnly={onBoardOnly} onCancel={onCancel} />;
  return (
    <Dialog open onClose={onCancel} title={BOARD_TEXT.changeTitle} subtitle={subtitle} icon={<ChipIcon />} footer={footer}>
      <p className="wb-dialog__lead">{differences.length > 0 ? differentIo(plan.to) : filesUseNames(plan.from)}</p>
      {renames && <RenameSection plan={plan} titled={differences.length > 0} />}
      {differences.length > 0 && <HandEdits differences={differences} board={plan.to} />}
      {renames && <ChangeChoices />}
      <p className="wb-boardchange__note">
        {renames && BOARD_TEXT.stringsNote}
        {simulating && ` ${BOARD_TEXT.stopsSimulation}`}
      </p>
    </Dialog>
  );
}

interface ChangeButtonsProps {
  plan: BoardChangePlan;
  /** Some file uses a name that would be renamed: Update files is offered. */
  renames: boolean;
  onUpdateFiles: () => void;
  onBoardOnly: () => void;
  onCancel: () => void;
}

/** Cancel, Change board only, and Update files when there is something to update. */
function ChangeButtons({ plan, renames, onUpdateFiles, onBoardOnly, onCancel }: ChangeButtonsProps) {
  const updatable = renames && canApply(plan);
  return (
    <div className="wb-newfile__buttons">
      <button type="button" className="wb-newfile__cancel" onClick={onCancel}>
        {BOARD_TEXT.cancel}
      </button>
      <button type="button" className={updatable ? 'wb-newfile__cancel' : 'wb-dialog__close'} autoFocus={!updatable} onClick={onBoardOnly}>
        {BOARD_TEXT.boardOnly}
      </button>
      {renames && (
        <button type="button" className="wb-dialog__close" autoFocus={updatable} disabled={!updatable} onClick={onUpdateFiles}>
          {BOARD_TEXT.updateFiles}
        </button>
      )}
    </div>
  );
}

/** The renames, and which files they change or why they cannot. */
function RenameSection({ plan, titled }: { plan: BoardChangePlan; titled: boolean }) {
  return (
    <>
      {titled && <p className="wb-boardchange__heading">{BOARD_TEXT.renamedInFiles}</p>}
      <RenameList plan={plan} />
      {canApply(plan) ? <ChangedFiles plan={plan} /> : <Conflicts plan={plan} />}
    </>
  );
}

/** What the student changes by hand on a board of another shape, and where its resources are. */
function HandEdits({ differences, board }: { differences: readonly ShapeDifference[]; board: BoardDefinition }) {
  return (
    <div className="wb-boardchange__handedits">
      <p className="wb-boardchange__heading">{BOARD_TEXT.changeByHand}</p>
      <ul aria-label={BOARD_TEXT.changeByHand}>
        {differences.map((difference) => (
          <li key={difference.role}>{formatShapeDifference(difference)}</li>
        ))}
      </ul>
      <BoardResourceLinks resources={board.resources} lead={BOARD_TEXT.boardResources} />
    </div>
  );
}

/** What Update files and Change board only do, in the buttons' own words. */
function ChangeChoices() {
  return (
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
