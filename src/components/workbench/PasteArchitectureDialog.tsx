// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useState } from 'react';
import { cx } from '../board';
import { CodeText } from './CodeText';
import { Dialog } from './Dialog';
import { AlertIcon } from './icons';
import {
  foundAsRenamed,
  type EntityRename,
  type ExistingArchitecture,
  type FoundBothWays,
  type PasteAnswers,
  type PasteQuestions,
} from './pastedArchitecture';
import {
  PASTE_TEXT,
  choicesSubtitle,
  deleteOthersDetail,
  deleteOthersTitle,
  deleteOthersWarning,
  notNeededWithoutRename,
  renameDetail,
  renameSkipped,
  replaceDetail,
  replaceSkipped,
  replaceTitle,
} from './pasteText';
import './PasteArchitectureDialog.css';

export interface PasteArchitectureDialogProps {
  questions: PasteQuestions;
  /** The file pasted into: an architecture there is named by its lines alone. */
  targetFileId: string;
  onPaste: (answers: PasteAnswers) => void;
  onClose: () => void;
}

interface ChangeCardProps {
  title: string;
  detail: string;
  /** A smaller line under the detail: what happens without the change, or why it is not needed. */
  note?: string;
  /** A small amber line, always shown: the code that ticking the card deletes. */
  warning?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Greyed out: the change does nothing as the other choices stand. */
  disabled?: boolean;
  /** Deletes code: tinted while it will, so that is seen before Paste. */
  deletes?: boolean;
}

/** A small line in a card: the amber warning (with its icon), or the grey note; nothing without text. */
function CardLine({ kind, text }: { kind: 'warning' | 'note'; text?: string }) {
  if (!text) return null;
  return (
    <span className={`wb-paste__${kind}`}>
      {kind === 'warning' && <AlertIcon aria-hidden="true" />}
      <CodeText text={text} />
    </span>
  );
}

function cardClass({ disabled, deletes, checked }: Pick<ChangeCardProps, 'disabled' | 'deletes' | 'checked'>): string {
  return cx('wb-paste__card', disabled && 'is-disabled', deletes && checked && !disabled && 'is-deleting');
}

function ChangeCard({ title, detail, note, warning, checked, onChange, disabled, deletes }: ChangeCardProps) {
  return (
    <label className={cardClass({ disabled, deletes, checked })}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="wb-paste__text">
        <strong className="wb-paste__title">{title}</strong>
        <span className="wb-paste__detail">
          <CodeText text={detail} />
        </span>
        <CardLine kind="warning" text={warning} />
        <CardLine kind="note" text={note} />
      </span>
    </label>
  );
}

/** Architectures a card names as the rename stands; greyed out (`needed` false) when they exist only after the rename. */
interface CardArchitectures {
  readonly shown: readonly ExistingArchitecture[];
  readonly needed: boolean;
}

function cardArchitectures(found: FoundBothWays, renameApplied: boolean): CardArchitectures {
  const current = foundAsRenamed(found, renameApplied);
  const needed = current.length > 0;
  return { shown: needed ? current : found.renamed, needed };
}

/** The note of a card greyed out because what it is about exists only after the rename. */
function notNeededNote({ needed }: CardArchitectures, rename: EntityRename | undefined): string | undefined {
  return !needed && rename !== undefined ? notNeededWithoutRename(rename) : undefined;
}

/**
 * The choices: the rename and the replace ticked at first, deleting other
 * architectures not (they may stay). Which architectures a card is about
 * depends on the name the paste ends up with; a card that matters only after
 * the rename stays, greyed out, while the rename is unticked, rather than vanish.
 */
function usePasteChoices(questions: PasteQuestions) {
  const [rename, setRename] = useState(true);
  const [replace, setReplace] = useState(true);
  const [deleteOthers, setDeleteOthers] = useState(false);
  const renameApplied = rename && questions.rename !== undefined;
  const duplicates = cardArchitectures(questions.duplicates, renameApplied);
  const others = cardArchitectures(questions.others, renameApplied);
  const cards = [questions.rename !== undefined, duplicates.shown.length > 0, others.shown.length > 0];
  return {
    answers: { rename, replace, deleteOthers },
    setRename,
    setReplace,
    setDeleteOthers,
    duplicates,
    others,
    cardCount: cards.filter(Boolean).length,
    /** Some change will be made: the button applies it, else it pastes the code as copied. */
    applies: renameApplied || (duplicates.needed && replace) || (others.needed && deleteOthers),
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

interface DeletingCardProps {
  architectures: CardArchitectures;
  targetFileId: string;
  rename?: EntityRename;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ReplaceCard({ architectures, targetFileId, rename, checked, onChange }: DeletingCardProps) {
  const { shown, needed } = architectures;
  const skipped = checked ? undefined : replaceSkipped(shown);
  return (
    <ChangeCard
      title={replaceTitle(shown)}
      detail={replaceDetail(shown, targetFileId)}
      note={notNeededNote(architectures, rename) ?? skipped}
      checked={checked}
      onChange={onChange}
      disabled={!needed}
      deletes
    />
  );
}

function DeleteOthersCard({ architectures, targetFileId, rename, checked, onChange }: DeletingCardProps) {
  const { shown, needed } = architectures;
  return (
    <ChangeCard
      title={deleteOthersTitle(shown)}
      detail={deleteOthersDetail(shown, targetFileId)}
      warning={deleteOthersWarning(shown, targetFileId)}
      note={notNeededNote(architectures, rename)}
      checked={checked}
      onChange={onChange}
      disabled={!needed}
      deletes
    />
  );
}

/**
 * Asks before a pasted architecture goes in: match the entity it is `of` when no
 * file declares that one, replace an architecture of the same name, and delete
 * the entity's other architectures. Each is a choice: the card of one left out
 * says what happens instead, and the button names what it will do.
 */
export function PasteArchitectureDialog({ questions, targetFileId, onPaste, onClose }: PasteArchitectureDialogProps) {
  const choices = usePasteChoices(questions);
  const { answers, duplicates, others } = choices;
  const deletingCardContext = { targetFileId, rename: questions.rename };
  return (
    <Dialog
      open
      onClose={onClose}
      title={PASTE_TEXT.title}
      subtitle={choicesSubtitle(choices.cardCount)}
      icon={<AlertIcon className="wb-paste__icon" />}
      footer={<PasteActions applies={choices.applies} onPaste={() => onPaste(answers)} onClose={onClose} />}
    >
      <div className="wb-paste">
        {questions.rename && (
          <ChangeCard
            title={PASTE_TEXT.renameTitle}
            detail={renameDetail(questions.rename)}
            note={answers.rename ? undefined : renameSkipped(questions.rename)}
            checked={answers.rename}
            onChange={choices.setRename}
          />
        )}
        {duplicates.shown.length > 0 && (
          <ReplaceCard architectures={duplicates} {...deletingCardContext} checked={answers.replace} onChange={choices.setReplace} />
        )}
        {others.shown.length > 0 && (
          <DeleteOthersCard architectures={others} {...deletingCardContext} checked={answers.deleteOthers} onChange={choices.setDeleteOthers} />
        )}
      </div>
    </Dialog>
  );
}
