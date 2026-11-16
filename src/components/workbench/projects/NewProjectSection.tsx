// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useId, useRef, useState, type FormEvent, type ReactNode, type Ref } from 'react';
import { findBoard } from '../../../boards/boardCatalog';
import type { BoardCatalog } from '../../../boards/types';
import { cx } from '../../board';
import type { NewFileLanguage } from '../newFile';
import { projectNameError } from '../projectFile';
import {
  choiceOf,
  fileNameField,
  LANGUAGE_OPTIONS,
  nameFromProject,
  topFileSummary,
  withTypedFileName,
  type NewProjectChoice,
  type NewProjectDraft,
} from './newProjectForm';
import type { OpenProjectInfo } from './openProject';
import './NewProjectSection.css';

export interface NewProjectSectionProps {
  /** Kept by the page, so leaving the section (to save the open project, say) keeps what was typed. */
  draft: NewProjectDraft;
  onDraftChange: (draft: NewProjectDraft) => void;
  boards: BoardCatalog;
  /** The project a new one replaces. */
  openProject: OpenProjectInfo;
  /** A project is being opened or saved: Create project waits. */
  busy: boolean;
  onCreate: (choice: NewProjectChoice) => void;
  onCancel: () => void;
}

/**
 * New project: a name, a board, the first file's name and language, in one form. The file
 * name follows the project name until it is typed, and the line under it says exactly
 * which file Create project makes (newProjectForm.ts). A missing name is said beside the
 * field only once Create project was pressed, and the input stays as it was.
 */
export function NewProjectSection({ draft, onDraftChange, boards, openProject, busy, onCreate, onCancel }: NewProjectSectionProps) {
  const ids = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [submitted, setSubmitted] = useState(false);
  const board = findBoard(boards, draft.board).board;
  const nameError = projectNameError(draft.name);
  const change = (patch: Partial<NewProjectDraft>) => onDraftChange({ ...draft, ...patch });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (nameError === undefined) onCreate(choiceOf(draft, board));
    else nameRef.current?.focus();
  };

  return (
    <form className="wb-newproject" onSubmit={handleSubmit} noValidate aria-label="New project">
      <div className="wb-page-card wb-newproject__card">
        <Field id={`${ids}-name`} label="Project name" error={submitted ? nameError : undefined}>
          {(described) => <TextInput {...described} inputRef={nameRef} value={draft.name} placeholder="e.g. Traffic light" autoFocus onChange={(name) => change({ name })} />}
        </Field>

        <Field id={`${ids}-board`} label="Board" hint={board.description}>
          {(described) => <BoardSelect {...described} boards={boards} board={board.id} onChange={(id) => change({ board: id })} />}
        </Field>

        <Field id={`${ids}-file`} label="File name" hint={topFileSummary(draft, board)}>
          {(described) => (
            <TextInput
              {...described}
              value={fileNameField(draft, board)}
              placeholder={nameFromProject(draft, board) || 'Follows the project name'}
              onChange={(typed) => onDraftChange(withTypedFileName(draft, typed))}
            />
          )}
        </Field>

        <LanguageCards name={`${ids}-language`} language={draft.language} onChange={(language) => change({ language })} />
        <ReplacesNote openProject={openProject} />
        <Actions busy={busy} onCancel={onCancel} />
      </div>
    </form>
  );
}

interface TextInputProps extends Described {
  value: string;
  placeholder: string;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onChange: (value: string) => void;
}

/** A name field: no spelling marks or autofill, since what is typed is a name, not a word. */
function TextInput({ inputRef, onChange, ...input }: TextInputProps) {
  return <input ref={inputRef} {...input} className="wb-newproject__input" type="text" spellCheck={false} autoComplete="off" onChange={(event) => onChange(event.target.value)} />;
}

interface BoardSelectProps extends Described {
  boards: BoardCatalog;
  board: string;
  onChange: (board: string) => void;
}

/** The boards installed here; a native list, so it opens and is read as the system's own. */
function BoardSelect({ boards, board, onChange, ...described }: BoardSelectProps) {
  return (
    <select {...described} className="wb-newproject__input wb-newproject__select" value={board} onChange={(event) => onChange(event.target.value)}>
      {boards.boards.map((candidate) => (
        <option key={candidate.id} value={candidate.id}>
          {candidate.name}
        </option>
      ))}
    </select>
  );
}

/** Cancel, then the primary Create project, which submits the form. */
function Actions({ busy, onCancel }: { busy: boolean; onCancel: () => void }) {
  return (
    <div className="wb-newproject__actions">
      <button type="button" className="wb-projects__btn" onClick={onCancel}>
        Cancel
      </button>
      <button type="submit" className="wb-projects__btn is-primary" disabled={busy}>
        Create project
      </button>
    </div>
  );
}

/** The attributes that tie a control to its label and to the line under it. */
interface Described {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
}

interface FieldProps {
  id: string;
  label: string;
  /** Under the control while there is no error. */
  hint?: string;
  error?: string;
  children: (described: Described) => ReactNode;
}

/** A label above its control, and under it the hint, or the error in its place. */
function Field({ id, label, hint, error, children }: FieldProps) {
  const lineId = `${id}-line`;
  const line = error ?? hint;
  return (
    <div className="wb-newproject__field">
      <label className="wb-newproject__label" htmlFor={id}>
        {label}
      </label>
      {children({ id, 'aria-describedby': line ? lineId : undefined, 'aria-invalid': error !== undefined || undefined })}
      {line && (
        <p id={lineId} className={cx('wb-newproject__hint', error !== undefined && 'is-error')} role={error !== undefined ? 'alert' : undefined}>
          {line}
        </p>
      )}
    </div>
  );
}

interface LanguageCardsProps {
  /** The radio group's name. */
  name: string;
  language: NewFileLanguage;
  onChange: (language: NewFileLanguage) => void;
}

/** VHDL or Verilog: native radio buttons in cards, so the arrow keys, focus and checked state are the browser's own. */
function LanguageCards({ name, language, onChange }: LanguageCardsProps) {
  return (
    <fieldset className="wb-newproject__field wb-newproject__languages">
      <legend className="wb-newproject__label">Language</legend>
      <div className="wb-newproject__language-cards">
        {LANGUAGE_OPTIONS.map((option) => (
          <label key={option.id} className="wb-newproject__language">
            <input type="radio" name={name} value={option.id} checked={language === option.id} onChange={() => onChange(option.id)} />
            <span className="wb-newproject__language-name">{option.label}</span>
            <span className="wb-newproject__extension">{option.extension}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Above the buttons: the project a new one takes the place of, and that unsaved changes are asked about first. */
function ReplacesNote({ openProject }: { openProject: OpenProjectInfo }) {
  return (
    <p className="wb-newproject__note">
      The new project replaces the open project, <strong>{openProject.name}</strong>.
      {openProject.unsaved && ' It has unsaved changes: you are asked what to do with them first.'}
    </p>
  );
}
