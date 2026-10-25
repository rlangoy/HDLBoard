// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { findBoard } from '../../boards/boardCatalog';
import { starterTopFileName } from '../../boards/boardTop';
import type { BoardCatalog } from '../../boards/types';
import { Dialog } from './Dialog';
import { FilesIcon } from './icons';
import { newFileName, newFileNameError, type NewFileLanguage } from './newFile';
import { projectFileNameFor, projectNameError } from './projectFile';
import './NewFileDialog.css';

/** New File › Create project's answer: the project, its board, and the language of its top file. */
export interface NewProjectChoice {
  readonly name: string;
  readonly board: string;
  readonly language: NewFileLanguage;
}

export interface NewFileDialogProps {
  /** Pre-filled in the name field, selected so typing replaces it. */
  suggestedName: string;
  /** Every file name in the project, so a duplicate is caught before it is created. */
  existingNames: readonly string[];
  /** `board` is the id chosen in the dialog's board list; the active board's when there is no list. */
  onCreate: (name: string, language: NewFileLanguage, board: string) => void;
  onClose: () => void;
  /** The language selected at first; VHDL unless given. */
  initialLanguage?: NewFileLanguage;
  /** Replaces the "Choose a name and a language" subtitle. */
  subtitle?: string;
  /** What the new file starts as: a board design (default) or an empty testbench. */
  kind?: 'design' | 'testbench';
  /**
   * Offers the Create project checkbox: a project file on the chosen board, with a top
   * file for that board in the chosen language. Not offered when this is not given.
   */
  onCreateProject?: (choice: NewProjectChoice) => void;
  /** The name of the project that is open now, which a new project replaces. */
  openProjectName?: string;
  /**
   * The boards to choose from: the board a new design declares the ports of, and a new
   * project's board. No list when left out (a testbench has no board ports).
   */
  boards?: BoardCatalog;
  /** The board chosen at first: the active one. */
  initialBoard: string;
}

/**
 * Asked by New File (the Files panel button and the editor's + tab): a name, VHDL or
 * Verilog, and the board. The extension follows the language, and the name has to be a
 * legal identifier of that language, since the file is created as a module or entity of
 * the same name (newFile.ts). With Create project ticked, the name is the project's and
 * its top file is named after the board instead.
 *
 * Mounted only while it is open, so every opening starts over with the suggested
 * name and VHDL.
 */
export function NewFileDialog(props: NewFileDialogProps) {
  const { suggestedName, existingNames, onCreate, onClose, initialLanguage = 'vhdl', subtitle, onCreateProject, boards, initialBoard } = props;
  const [name, setName] = useState(suggestedName);
  const [language, setLanguage] = useState<NewFileLanguage>(initialLanguage);
  const [asProject, setAsProject] = useState(false);
  const [board, setBoard] = useState(initialBoard);
  const formId = useId();

  const error = asProject ? projectNameError(name) : newFileNameError(name, language, existingNames);
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (error !== undefined) return;
    if (asProject) onCreateProject?.({ name: name.trim(), board, language });
    else onCreate(newFileName(name, language), language, board);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={asProject ? 'New Project' : 'New File'}
      subtitle={subtitle ?? 'Choose a name, a language and a board'}
      icon={<FilesIcon />}
      footer={<CreateButtons formId={formId} disabled={error !== undefined} onClose={onClose} />}
    >
      <form id={formId} className="wb-newfile" onSubmit={handleSubmit}>
        <NameField formId={formId} name={name} onName={setName} asProject={asProject} hint={<Hint {...props} name={name} language={language} board={board} asProject={asProject} error={error} />} error={error} />
        <LanguageChoice formId={formId} language={language} onLanguage={setLanguage} />
        {onCreateProject && (
          <label className="wb-newfile__radio wb-newfile__project">
            <input type="checkbox" checked={asProject} onChange={(e) => setAsProject(e.target.checked)} />
            Create project <span className="wb-newfile__ext">.hdlboard.json</span>
          </label>
        )}
        {boards !== undefined && <BoardChoice formId={formId} boards={boards} board={board} onBoard={setBoard} />}
      </form>
    </Dialog>
  );
}

function CreateButtons({ formId, disabled, onClose }: { formId: string; disabled: boolean; onClose: () => void }) {
  return (
    <div className="wb-newfile__buttons">
      <button type="button" className="wb-newfile__cancel" onClick={onClose}>
        Cancel
      </button>
      <button type="submit" form={formId} className="wb-dialog__close" disabled={disabled}>
        Create
      </button>
    </div>
  );
}

interface NameFieldProps {
  formId: string;
  name: string;
  onName: (name: string) => void;
  asProject: boolean;
  hint: ReactNode;
  error: string | undefined;
}

function NameField({ formId, name, onName, asProject, hint, error }: NameFieldProps) {
  const errorId = `${formId}-error`;
  const showError = error !== undefined && name.trim() !== '';
  return (
    <>
      <label className="wb-newfile__label" htmlFor={`${formId}-name`}>
        {asProject ? 'Project name' : 'File name'}
      </label>
      <input
        id={`${formId}-name`}
        className="wb-newfile__name"
        type="text"
        value={name}
        onChange={(e) => onName(e.target.value)}
        onFocus={(e) => e.target.select()}
        autoFocus
        spellCheck={false}
        autoComplete="off"
        aria-invalid={showError}
        aria-describedby={errorId}
      />
      <p id={errorId} className="wb-newfile__hint" role={showError ? 'alert' : undefined}>
        {hint}
      </p>
    </>
  );
}

type HintProps = NewFileDialogProps & { name: string; language: NewFileLanguage; board: string; asProject: boolean; error: string | undefined };

/** What Create will do, or why it cannot: an empty field is not worth a red line, the disabled Create says enough. */
function Hint({ name, language, board, asProject, error, kind = 'design', boards, existingNames, openProjectName }: HintProps) {
  if (name.trim() === '') return <>{asProject ? 'Enter a name for the new project.' : 'Enter a name for the new file.'}</>;
  if (error !== undefined) return <span className="wb-newfile__error">{error}</span>;
  const chosen = boards === undefined ? undefined : findBoard(boards, board).board;
  if (asProject && chosen !== undefined) {
    return (
      <>
        Creates <strong>{projectFileNameFor(name)}</strong> with <strong>{starterTopFileName(chosen, language, [])}</strong>, a top file
        for the {chosen.name} board, and opens the project settings.{existingNames.length > 0 && ' You are asked what to do with your files.'}
        {openProjectName !== undefined && <> It replaces the open project, {openProjectName}.</>}
      </>
    );
  }
  return (
    <>
      Creates <strong>{newFileName(name, language)}</strong>
      {language === 'verilog' ? ' with a module' : ' with an entity'} of the same name
      {kind === 'testbench' ? ': an empty testbench, no ports.' : ` and the ${chosen?.name ?? 'board'}'s ports.`}
    </>
  );
}

function LanguageChoice({ formId, language, onLanguage }: { formId: string; language: NewFileLanguage; onLanguage: (language: NewFileLanguage) => void }) {
  return (
    <fieldset className="wb-newfile__languages">
      <legend className="wb-newfile__label">Language</legend>
      <label className="wb-newfile__radio">
        <input type="radio" name={`${formId}-language`} value="vhdl" checked={language === 'vhdl'} onChange={() => onLanguage('vhdl')} />
        VHDL <span className="wb-newfile__ext">.vhd</span>
      </label>
      <label className="wb-newfile__radio">
        <input type="radio" name={`${formId}-language`} value="verilog" checked={language === 'verilog'} onChange={() => onLanguage('verilog')} />
        Verilog <span className="wb-newfile__ext">.v</span>
      </label>
    </fieldset>
  );
}

interface BoardChoiceProps {
  formId: string;
  boards: BoardCatalog;
  board: string;
  onBoard: (board: string) => void;
}

function BoardChoice({ formId, boards, board, onBoard }: BoardChoiceProps) {
  return (
    <>
      <label className="wb-newfile__label wb-newfile__board-label" htmlFor={`${formId}-board`}>
        Board
      </label>
      {/* A native list: it opens over the dialog, where a drawn one would be clipped by the dialog's scroll area. */}
      <select id={`${formId}-board`} className="wb-newfile__name wb-newfile__board" value={board} onChange={(e) => onBoard(e.target.value)}>
        {boards.boards.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name}
          </option>
        ))}
      </select>
    </>
  );
}

export default NewFileDialog;
