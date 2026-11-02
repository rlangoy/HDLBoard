// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useState } from 'react';
import { CodeText } from './CodeText';
import { Dialog } from './Dialog';
import { CodeIcon } from './icons';
import type { PasteAnswers, PasteQuestions } from './pastedArchitecture';
import { PASTE_TEXT, renameChoice, replaceChoice } from './pasteText';
import './PasteArchitectureDialog.css';

export interface PasteArchitectureDialogProps {
  questions: PasteQuestions;
  /** The file pasted into: a duplicate there is named without its file. */
  targetFileId: string;
  onPaste: (answers: PasteAnswers) => void;
  onClose: () => void;
}

function Choice({ text, checked, onChange }: { text: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="wb-paste__choice">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <CodeText text={text} />
      </span>
    </label>
  );
}

/**
 * Asks before a pasted architecture goes in: change the entity it is `of` when
 * no file declares that one, and replace an architecture of the same name. Both
 * are ticked; with neither, the code is pasted as it was copied.
 */
export function PasteArchitectureDialog({ questions, targetFileId, onPaste, onClose }: PasteArchitectureDialogProps) {
  const [rename, setRename] = useState(true);
  const [replace, setReplace] = useState(true);
  const duplicates = rename && questions.rename ? questions.duplicates.renamed : questions.duplicates.asPasted;
  return (
    <Dialog
      open
      onClose={onClose}
      title={PASTE_TEXT.title}
      subtitle={PASTE_TEXT.subtitle}
      icon={<CodeIcon />}
      footer={
        <div className="wb-dialog__actions">
          <button type="button" className="wb-dialog__secondary" onClick={onClose}>
            {PASTE_TEXT.cancel}
          </button>
          <button type="button" className="wb-dialog__close" autoFocus onClick={() => onPaste({ rename, replace })}>
            {PASTE_TEXT.paste}
          </button>
        </div>
      }
    >
      <div className="wb-paste">
        {questions.rename && <Choice text={renameChoice(questions.rename)} checked={rename} onChange={setRename} />}
        {duplicates.length > 0 && <Choice text={replaceChoice(duplicates, targetFileId)} checked={replace} onChange={setReplace} />}
      </div>
    </Dialog>
  );
}
