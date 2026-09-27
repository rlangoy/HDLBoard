// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useId, useState, type FormEvent } from 'react';
import { Dialog } from './Dialog';
import { FilesIcon } from './icons';
import { newFileName, newFileNameError, type NewFileLanguage } from './newFile';
import './NewFileDialog.css';

export interface NewFileDialogProps {
  /** Pre-filled in the name field, selected so typing replaces it. */
  suggestedName: string;
  /** Every file name in the project, so a duplicate is caught before it is created. */
  existingNames: readonly string[];
  onCreate: (name: string, language: NewFileLanguage) => void;
  onClose: () => void;
}

/**
 * Asked by New File (the Files panel button and the editor's + tab): a name, and
 * VHDL or Verilog below it — VHDL unless changed. The extension follows the radio
 * button, and the name has to be a legal identifier of that language, since the
 * file is created as a module or entity of the same name (newFile.ts).
 *
 * Mounted only while it is open, so every opening starts over with the suggested
 * name and VHDL.
 */
export function NewFileDialog({ suggestedName, existingNames, onCreate, onClose }: NewFileDialogProps) {
  const [name, setName] = useState(suggestedName);
  const [language, setLanguage] = useState<NewFileLanguage>('vhdl');
  const formId = useId();
  const errorId = `${formId}-error`;

  const error = newFileNameError(name, language, existingNames);
  // An empty field is not worth a red line; the disabled Create says enough.
  const empty = name.trim() === '';
  const showError = error !== undefined && !empty;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (error !== undefined) return;
    onCreate(newFileName(name, language), language);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="New File"
      subtitle="Choose a name and a language"
      icon={<FilesIcon />}
      footer={
        <div className="wb-newfile__buttons">
          <button type="button" className="wb-newfile__cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className="wb-dialog__close" disabled={error !== undefined}>
            Create
          </button>
        </div>
      }
    >
      <form id={formId} className="wb-newfile" onSubmit={handleSubmit}>
        <label className="wb-newfile__label" htmlFor={`${formId}-name`}>
          File name
        </label>
        <input
          id={`${formId}-name`}
          className="wb-newfile__name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.target.select()}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          aria-invalid={showError}
          aria-describedby={errorId}
        />
        <p id={errorId} className="wb-newfile__hint" role={showError ? 'alert' : undefined}>
          {empty ? (
            'Enter a name for the new file.'
          ) : showError ? (
            <span className="wb-newfile__error">{error}</span>
          ) : (
            <>
              Creates <strong>{newFileName(name, language)}</strong>
              {language === 'verilog' ? ' with a module' : ' with an entity'} of the same name and the board's ports.
            </>
          )}
        </p>

        <fieldset className="wb-newfile__languages">
          <legend className="wb-newfile__label">Language</legend>
          <label className="wb-newfile__radio">
            <input
              type="radio"
              name={`${formId}-language`}
              value="vhdl"
              checked={language === 'vhdl'}
              onChange={() => setLanguage('vhdl')}
            />
            VHDL <span className="wb-newfile__ext">.vhd</span>
          </label>
          <label className="wb-newfile__radio">
            <input
              type="radio"
              name={`${formId}-language`}
              value="verilog"
              checked={language === 'verilog'}
              onChange={() => setLanguage('verilog')}
            />
            Verilog <span className="wb-newfile__ext">.v</span>
          </label>
        </fieldset>
      </form>
    </Dialog>
  );
}

export default NewFileDialog;
