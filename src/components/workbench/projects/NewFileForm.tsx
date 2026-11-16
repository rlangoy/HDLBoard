// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { FileNameInput, NewFileHint } from '../FileNameParts';
import { FilePlusIcon } from '../icons';
import { NEW_FILE_EXTENSION, newFileName, newFileNameError, type NewFileLanguage } from '../newFile';
import { LANGUAGE_OPTIONS } from './newProjectForm';

export interface NewFileFormProps {
  /** Fixed while the form is open: Cancel, then the other button, changes it. */
  language: NewFileLanguage;
  /** What the name field starts with, e.g. untitled1. */
  suggestedName: string;
  /** The names in Files, which a new file may not take. */
  existingNames: readonly string[];
  busy: boolean;
  /** Called with the full file name (newFileName), once the name is valid. */
  onCreate: (fileName: string, language: NewFileLanguage) => void;
  onCancel: () => void;
}

/**
 * Create new file, inline: the name of a new file in the chosen language, checked as New File
 * checks it (newFile.ts). A name that cannot be used says why under the field, and the form stays.
 */
export function NewFileForm(props: NewFileFormProps) {
  const { language, busy, onCancel } = props;
  const id = useId();
  const field = useFileNameField(props);
  const label = languageLabel(language);
  return (
    <form className="wb-new-file" aria-labelledby={`${id}-title`} onSubmit={field.submit} noValidate>
      <h4 id={`${id}-title`} className="wb-new-file__title">
        <FilePlusIcon aria-hidden="true" />
        Create {label} file
      </h4>
      <p className="wb-new-file__language">
        <strong>{label}</strong> · {NEW_FILE_EXTENSION[language]}
      </p>
      <NameField id={id} language={language} field={field} onCancel={onCancel} />
      <div className="wb-new-file__actions">
        <button type="button" className="wb-projects__btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="wb-projects__btn is-primary" disabled={busy}>
          Create file
        </button>
      </div>
    </form>
  );
}

interface FileNameField {
  readonly name: string;
  readonly setName: (name: string) => void;
  /** Why the name cannot be used, once that is worth saying. */
  readonly shownError: string | undefined;
  readonly submit: (event: FormEvent<HTMLFormElement>) => void;
}

/** The typed name, checked; Create file creates it, or shows why it cannot. */
function useFileNameField({ language, suggestedName, existingNames, onCreate }: NewFileFormProps): FileNameField {
  const [name, setName] = useState(suggestedName);
  const [triedToCreate, setTriedToCreate] = useState(false);
  const error = newFileNameError(name, language, existingNames);
  // An empty field is only an error once Create file was pressed; before that, the hint asks for a name.
  const shownError = triedToCreate || name.trim() !== '' ? error : undefined;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTriedToCreate(true);
    if (error === undefined) onCreate(newFileName(name, language), language);
  };
  return { name, setName, shownError, submit };
}

interface NameFieldProps {
  id: string;
  language: NewFileLanguage;
  field: FileNameField;
  onCancel: () => void;
}

function NameField({ id, language, field, onCancel }: NameFieldProps) {
  // Escape cancels the form rather than closing the Projects page around it.
  const cancelOnEscape = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onCancel();
  };
  return (
    <>
      <label className="wb-new-file__label" htmlFor={`${id}-name`}>
        File name
      </label>
      <div className="wb-new-file__field">
        <FileNameInput
          id={`${id}-name`}
          className="wb-new-file__name"
          value={field.name}
          onChange={field.setName}
          onKeyDown={cancelOnEscape}
          invalid={field.shownError !== undefined}
          describedBy={`${id}-hint`}
        />
        <p id={`${id}-hint`} className="wb-new-file__hint" role={field.shownError === undefined ? undefined : 'alert'}>
          <NewFileHint name={field.name} language={language} error={field.shownError} />
        </p>
      </div>
    </>
  );
}

function languageLabel(language: NewFileLanguage): string {
  return LANGUAGE_OPTIONS.find((option) => option.id === language)?.label ?? language;
}
