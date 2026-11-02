// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useState } from 'react';
import { cx } from '../board';
import { CodeText } from './CodeText';
import { Dialog } from './Dialog';
import { AlertIcon } from './icons';
import type { EntityRename, ExistingArchitecture, PasteAnswers, PasteQuestions } from './pastedArchitecture';
import {
  PASTE_TEXT,
  changesSubtitle,
  renameDetail,
  renameSkipped,
  replaceDetail,
  replaceNotNeeded,
  replaceSkipped,
  replaceTitle,
} from './pasteText';
import './PasteArchitectureDialog.css';

export interface PasteArchitectureDialogProps {
  questions: PasteQuestions;
  /** The file pasted into: a duplicate there is named by its lines alone. */
  targetFileId: string;
  onPaste: (answers: PasteAnswers) => void;
  onClose: () => void;
}

interface ChangeCardProps {
  title: string;
  detail: string;
  /** A smaller line under the detail: what happens without the change, or why it is not needed. */
  note?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Greyed out: the change does nothing as the other choice stands. */
  disabled?: boolean;
  /** Deletes code: tinted while it will, so that is seen before Paste. */
  deletes?: boolean;
}

function ChangeCard({ title, detail, note, checked, onChange, disabled = false, deletes = false }: ChangeCardProps) {
  return (
    <label className={cx('wb-paste__card', disabled && 'is-disabled', deletes && checked && !disabled && 'is-deleting')}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="wb-paste__text">
        <strong className="wb-paste__title">{title}</strong>
        <span className="wb-paste__detail">
          <CodeText text={detail} />
        </span>
        {note && (
          <span className="wb-paste__note">
            <CodeText text={note} />
          </span>
        )}
      </span>
    </label>
  );
}

/**
 * The two choices, both ticked at first, and what follows from them. A pasted
 * architecture may duplicate one only under the name the rename gives it: its
 * card then stays, greyed out while the rename is unticked, rather than vanish.
 */
function usePasteChoices(questions: PasteQuestions) {
  const [rename, setRename] = useState(true);
  const [replace, setReplace] = useState(true);
  const { asPasted, renamed } = questions.duplicates;
  const current = rename && questions.rename ? renamed : asPasted;
  const shown = current.length > 0 ? current : renamed;
  const replaceNeeded = current.length > 0;
  return {
    rename,
    setRename,
    replace,
    setReplace,
    /** The architectures the replace card names; none: no card. */
    shown,
    replaceNeeded,
    offered: Number(questions.rename !== undefined) + Number(shown.length > 0),
    /** Some change will be made: the button applies it, else it pastes the code as copied. */
    applies: (questions.rename !== undefined && rename) || (replaceNeeded && replace),
  };
}

function PasteActions({ applies, onPaste, onClose }: { applies: boolean; onPaste: () => void; onClose: () => void }) {
  return (
    <div className="wb-dialog__actions">
      <button type="button" className="wb-dialog__secondary" onClick={onClose}>
        {PASTE_TEXT.cancel}
      </button>
      <button type="button" className="wb-dialog__close" autoFocus onClick={onPaste}>
        {applies ? PASTE_TEXT.applyAndPaste : PASTE_TEXT.pasteAsCopied}
      </button>
    </div>
  );
}

interface ReplaceCardProps {
  architectures: readonly ExistingArchitecture[];
  targetFileId: string;
  /** False while the rename that makes the duplicate is unticked. */
  needed: boolean;
  rename?: EntityRename;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ReplaceCard({ architectures, targetFileId, needed, rename, checked, onChange }: ReplaceCardProps) {
  const notNeeded = !needed && rename !== undefined ? replaceNotNeeded(rename) : undefined;
  return (
    <ChangeCard
      title={replaceTitle(architectures)}
      detail={replaceDetail(architectures, targetFileId)}
      note={notNeeded ?? (checked ? undefined : replaceSkipped(architectures))}
      checked={checked}
      onChange={onChange}
      disabled={!needed}
      deletes
    />
  );
}

/**
 * Asks before a pasted architecture goes in: match the entity it is `of` when no
 * file declares that one, and replace an architecture of the same name. Both are
 * suggestions, ticked: either may be left out, legal VHDL, and the card then
 * says what happens instead. The button names what it will do.
 */
export function PasteArchitectureDialog({ questions, targetFileId, onPaste, onClose }: PasteArchitectureDialogProps) {
  const choices = usePasteChoices(questions);
  const { rename, replace } = choices;
  return (
    <Dialog
      open
      onClose={onClose}
      title={PASTE_TEXT.title}
      subtitle={changesSubtitle(choices.offered)}
      icon={<AlertIcon className="wb-paste__icon" />}
      footer={<PasteActions applies={choices.applies} onPaste={() => onPaste({ rename, replace })} onClose={onClose} />}
    >
      <div className="wb-paste">
        {questions.rename && (
          <ChangeCard
            title={PASTE_TEXT.renameTitle}
            detail={renameDetail(questions.rename)}
            note={rename ? undefined : renameSkipped(questions.rename)}
            checked={rename}
            onChange={choices.setRename}
          />
        )}
        {choices.shown.length > 0 && (
          <ReplaceCard
            architectures={choices.shown}
            targetFileId={targetFileId}
            needed={choices.replaceNeeded}
            rename={questions.rename}
            checked={replace}
            onChange={choices.setReplace}
          />
        )}
      </div>
    </Dialog>
  );
}
