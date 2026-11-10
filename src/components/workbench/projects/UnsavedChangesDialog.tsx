// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useRef, useState, type ReactNode } from 'react';
import { Dialog } from '../Dialog';
import { AlertIcon } from '../icons';
import type { SaveDestination } from './openProject';
import '../NewFileDialog.css';

/** What the student chose when another project would replace one with unsaved changes. */
export type UnsavedAnswer = 'save' | 'discard' | 'cancel';

/** The question, as it is asked: the open project, where it saves, and what would replace it. */
export interface UnsavedQuestion {
  projectName: string;
  destination: SaveDestination;
  /** What is about to open, e.g. "Knight Rider". */
  opening: string;
}

const DESTINATION_TEXT: Record<SaveDestination, string> = { local: 'on this computer', github: 'on GitHub' };

export interface UnsavedChangesDialogProps {
  question: UnsavedQuestion;
  onAnswer: (answer: UnsavedAnswer) => void;
}

/** Another project would replace the open one's unsaved changes (issue #44): Save, Discard changes, or Cancel. */
export function UnsavedChangesDialog({ question, onAnswer }: UnsavedChangesDialogProps) {
  const name = question.projectName || 'The open project';
  return (
    <Dialog
      open
      onClose={() => onAnswer('cancel')}
      title="Save your changes?"
      subtitle={`Before opening ${question.opening}`}
      icon={<AlertIcon />}
      describedBy="wb-unsaved-text"
      footer={
        <div className="wb-dialog__actions">
          <button type="button" className="wb-dialog__secondary" onClick={() => onAnswer('cancel')}>
            Cancel
          </button>
          <button type="button" className="wb-dialog__secondary" onClick={() => onAnswer('discard')}>
            Discard changes
          </button>
          <button type="button" className="wb-dialog__close" autoFocus onClick={() => onAnswer('save')}>
            Save
          </button>
        </div>
      }
    >
      <p id="wb-unsaved-text" className="wb-newfile__label">
        {name} has changes that are not saved {DESTINATION_TEXT[question.destination]}. Save saves them there first; Discard changes opens {question.opening}{' '}
        without them.
      </p>
    </Dialog>
  );
}

/** Asks the question and waits for the answer; `dialog` is what to render meanwhile. */
export function useUnsavedChangesQuestion(): { ask: (question: UnsavedQuestion) => Promise<UnsavedAnswer>; dialog: ReactNode } {
  const [question, setQuestion] = useState<UnsavedQuestion | null>(null);
  // The caller waiting for the answer; a ref, so a second question in the same render still finds the first.
  const pending = useRef<((answer: UnsavedAnswer) => void) | null>(null);
  const settle = (answer: UnsavedAnswer) => {
    pending.current?.(answer);
    pending.current = null;
  };
  const ask = (next: UnsavedQuestion) =>
    new Promise<UnsavedAnswer>((resolve) => {
      // A new question cancels one still open, so no caller is left waiting.
      settle('cancel');
      pending.current = resolve;
      setQuestion(next);
    });
  const onAnswer = (answer: UnsavedAnswer) => {
    settle(answer);
    setQuestion(null);
  };
  return { ask, dialog: question && <UnsavedChangesDialog question={question} onAnswer={onAnswer} /> };
}
